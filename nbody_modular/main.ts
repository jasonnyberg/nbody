import { WebGPUContext } from './common/webgpu-context.js';
import { OrbitCamera } from './common/camera.js';
import { mat4 } from './common/gl-matrix-util.js';

import { IntegrateModule } from './modules/integrate.js';
import { RenderModule } from './modules/render.js';
import { ReduceModule } from './modules/reduce.js';
import { LinesModule } from './modules/lines.js';
import { BoxesModule } from './modules/boxes.js';

interface SimParams {
    particleCount: number;
    g: number;
    dt: number;
    damping: number;
    repulsion: number;
    spin: number;
    radiative: number;
    wgSize: number;
    bucketSize: number;
    bucketCount: number;
    maxPairs: number;
}

export class NBodySimulation {
    private canvas: HTMLCanvasElement;
    private uiContainer: HTMLElement;
    private webgpuContext: WebGPUContext;
    private camera!: OrbitCamera;

    private params: SimParams;
    private paused: boolean;
    private stepRequested: boolean;

    // Modules
    private integrateModule!: IntegrateModule;
    private renderModule!: RenderModule;
    private reduceModule!: ReduceModule;
    private linesModule!: LinesModule;
    private boxesModule!: BoxesModule;

    // Buffers
    private posA!: GPUBuffer; private posB!: GPUBuffer;
    private prevPosA!: GPUBuffer; private prevPosB!: GPUBuffer;
    private masses!: GPUBuffer;
    private simParamsBuf!: GPUBuffer;
    private repulseBuf!: GPUBuffer;
    private radBuf!: GPUBuffer;
    private spinBuf!: GPUBuffer;
    private dampBuf!: GPUBuffer;
    private matsBuf!: GPUBuffer;
    private nodeBuf!: GPUBuffer;
    private nodeParamsBuf!: GPUBuffer;
    private visPairBuf!: GPUBuffer;
    private outPairCountBuf!: GPUBuffer;

    private posIsA: boolean;

    constructor(canvas: HTMLCanvasElement, uiContainer: HTMLElement) {
        this.canvas = canvas;
        this.uiContainer = uiContainer;
        this.webgpuContext = new WebGPUContext(this.canvas);

        this.params = {
            particleCount: 32,
            g: 3.30,
            dt: 0.50,
            damping: 1.0,
            repulsion: 10.0,
            spin: 0.0,
            radiative: 0.005,
            wgSize: 64,
            bucketSize: 4,
            bucketCount: 0, // Calculated in createBuffers
            maxPairs: 0,    // Calculated in createBuffers
        };

        this.paused = false;
        this.stepRequested = false;
        this.posIsA = true;
    }

    public async init(): Promise<void> {
        await this.webgpuContext.init();
        const { device, format } = this.webgpuContext;

        if (!device || !format) {
            throw new Error("WebGPU context initialization failed.");
        }

        this.camera = new OrbitCamera(this.canvas, 2000);

        this.createBuffers();
        this.setupUI();

        // Initialize modules
        this.integrateModule = new IntegrateModule();
        await this.integrateModule.init(device, this.params.wgSize);

        this.renderModule = new RenderModule();
        await this.renderModule.init(device, format);

        this.reduceModule = new ReduceModule();
        await this.reduceModule.init(device);

        this.linesModule = new LinesModule();
        await this.linesModule.init(device, format);

        this.boxesModule = new BoxesModule();
        await this.boxesModule.init(device, format, this.params.bucketCount);

        console.log("N-Body Simulation Initialized");
    }

    private createBuffers(): void {
        const { device } = this.webgpuContext;
        if (!device) throw new Error("Device not available");

        const { particleCount, bucketSize } = this.params;
        const stride = 4;
        const stateBytes = particleCount * stride * 4;

        this.params.bucketCount = Math.ceil(particleCount / bucketSize);
        this.params.maxPairs = (particleCount * (particleCount - 1)) / 2;

        const posInit = new Float32Array(particleCount * stride);
        const massInit = new Float32Array(particleCount);
        const rad = 800.0;
        for (let i = 0; i < particleCount; i++) {
            let x, y, z;
            do {
                x = (Math.random() * 2 - 1) * rad;
                y = (Math.random() * 2 - 1) * rad;
                z = (Math.random() * 2 - 1) * rad;
            } while (x * x + y * y + z * z > rad * rad);
            const o = i * stride;
            posInit[o] = x; posInit[o + 1] = y; posInit[o + 2] = z; posInit[o + 3] = 0;
            massInit[i] = 1.0;
        }

        const buf = (arr: Float32Array | Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer => {
            const buffer = device.createBuffer({ size: arr.byteLength, usage, mappedAtCreation: true });
            const constructor = arr instanceof Float32Array ? Float32Array : Uint32Array;
            new constructor(buffer.getMappedRange()).set(arr);
            buffer.unmap();
            return buffer;
        };

        this.posA = buf(posInit, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
        this.posB = device.createBuffer({ size: stateBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        this.prevPosA = buf(posInit, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
        this.prevPosB = device.createBuffer({ size: stateBytes, usage: GPUBufferUsage.STORAGE });
        this.masses = buf(massInit, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);

        this.simParamsBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.repulseBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.radBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.spinBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.dampBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.matsBuf = device.createBuffer({ size: 40 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

        this.nodeBuf = device.createBuffer({ size: this.params.bucketCount * 2 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.nodeParamsBuf = buf(new Float32Array([particleCount, bucketSize, this.params.bucketCount, 0]), GPUBufferUsage.UNIFORM);
        this.visPairBuf = device.createBuffer({ size: this.params.maxPairs * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.outPairCountBuf = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

        const allPairs = new Uint32Array(this.params.maxPairs * 4);
        let pIdx = 0;
        for (let i = 0; i < particleCount; i++) {
            for (let j = i + 1; j < particleCount; j++) {
                const o = pIdx * 4;
                allPairs[o] = i; allPairs[o + 1] = j;
                pIdx++;
            }
        }
        device.queue.writeBuffer(this.visPairBuf, 0, allPairs);
        device.queue.writeBuffer(this.outPairCountBuf, 0, new Uint32Array([pIdx]));
    }

    private updateUniforms(): void {
        const { device } = this.webgpuContext;
        if (!device) return;

        const { g, dt, particleCount, repulsion, radiative, spin, damping } = this.params;

        device.queue.writeBuffer(this.simParamsBuf, 0, new Float32Array([dt, g, 1.0, particleCount]));
        device.queue.writeBuffer(this.repulseBuf, 0, new Float32Array([repulsion]));
        device.queue.writeBuffer(this.radBuf, 0, new Float32Array([radiative]));
        device.queue.writeBuffer(this.spinBuf, 0, new Float32Array([spin]));
        device.queue.writeBuffer(this.dampBuf, 0, new Float32Array([damping]));

        const proj = this.camera.getProjectionMatrix(this.canvas.width / this.canvas.height);
        const view = this.camera.getViewMatrix();
        const matsArray = new Float32Array(40);
        matsArray.set(proj);
        matsArray.set(view, 16);
        matsArray[32] = this.canvas.width;
        matsArray[33] = this.canvas.height;
        matsArray[34] = 18.0; // sizeScale
        matsArray[35] = 1.0 / Math.log(1.0 + 8.0); // invLogMax
        device.queue.writeBuffer(this.matsBuf, 0, matsArray);
    }

    public run(): void {
        const frame = () => {
            if (!this.paused || this.stepRequested) {
                const { device, context } = this.webgpuContext;
                if (!device || !context) {
                    requestAnimationFrame(frame);
                    return;
                }

                this.updateUniforms();

                const commandEncoder = device.createCommandEncoder();

                const computePass = commandEncoder.beginComputePass();
                const integrateBG = this.integrateModule.createBindGroup(device, {
                    posIn: this.posIsA ? this.posA : this.posB,
                    prevPosIn: this.posIsA ? this.prevPosA : this.prevPosB,
                    posOut: this.posIsA ? this.posB : this.posA,
                    prevPosOut: this.posIsA ? this.prevPosB : this.prevPosA,
                    simParams: this.simParamsBuf, masses: this.masses, damp: this.dampBuf,
                    repulse: this.repulseBuf, rad: this.radBuf, spin: this.spinBuf
                });
                this.integrateModule.run(computePass, integrateBG, this.params.particleCount, this.params.wgSize);
                computePass.end();

                const reducePass = commandEncoder.beginComputePass();
                const reduceBG = this.reduceModule.createBindGroup(device, {
                    pos: this.posIsA ? this.posB : this.posA,
                    node: this.nodeBuf,
                    nodeParams: this.nodeParamsBuf
                });
                this.reduceModule.run(reducePass, reduceBG, this.params.bucketCount);
                reducePass.end();

                const renderPass = commandEncoder.beginRenderPass({
                    colorAttachments: [{
                        view: context.getCurrentTexture().createView(),
                        clearValue: { r: 0, g: 0, b: 0, a: 1 },
                        loadOp: 'clear', storeOp: 'store'
                    }]
                });

                const renderBG = this.renderModule.createBindGroup(device, {
                    pos: this.posIsA ? this.posB : this.posA,
                    masses: this.masses,
                    mats: this.matsBuf
                });
                this.renderModule.run(renderPass, renderBG, this.params.particleCount);

                const linesBG = this.linesModule.createBindGroup(device, {
                    pos: this.posIsA ? this.posB : this.posA,
                    visPair: this.visPairBuf,
                    mats: this.matsBuf,
                    outPairCount: this.outPairCountBuf
                });
                this.linesModule.run(renderPass, linesBG, this.params.maxPairs);

                const boxesBG = this.boxesModule.createBindGroup(device, { 
                    node: this.nodeBuf, 
                    mats: this.matsBuf 
                });
                this.boxesModule.run(renderPass, boxesBG, this.params.bucketCount);

                renderPass.end();
                device.queue.submit([commandEncoder.finish()]);

                this.posIsA = !this.posIsA;
                this.stepRequested = false;
            }

            requestAnimationFrame(frame);
        };

        requestAnimationFrame(frame);
    }

    private setupUI(): void {
        this.uiContainer.innerHTML = `
            <div><b>Controls</b></div>
            <label>G: <span id="gVal">${this.params.g.toFixed(2)}</span></label>
            <input id="g" type="range" min="0.01" max="5.0" step="0.01" value="${this.params.g}" />
            <label>dt: <span id="dtVal">${this.params.dt.toFixed(2)}</span></label>
            <input id="dt" type="range" min="0.01" max="1.00" step="0.01" value="${this.params.dt}" />
            <label>Damping: <span id="dampVal">${this.params.damping.toFixed(3)}</span></label>
            <input id="damp" type="range" min="0.0" max="1.0" step="0.001" value="${this.params.damping}" />
            <label>Repulsion R: <span id="repVal">${this.params.repulsion}</span></label>
            <input id="rep" type="range" min="0" max="100" step="1" value="${this.params.repulsion}" />
            <label>Spin: <span id="spinVal">${this.params.spin.toFixed(2)}</span></label>
            <input id="spin" type="range" min="-2.0" max="2.0" step="0.01" value="${this.params.spin}" />
            <label>Radiative: <span id="radVal">${this.params.radiative.toFixed(3)}</span></label>
            <input id="rad" type="range" min="0.0" max="0.1" step="0.001" value="${this.params.radiative}" />
            <div style="margin-top:6px;">
              <button id="startStop">Pause</button>
              <button id="step">Step</button>
            </div>
        `;

        const setupSlider = (id: string, labelId: string, key: keyof SimParams) => {
            const slider = document.getElementById(id) as HTMLInputElement;
            const label = document.getElementById(labelId) as HTMLSpanElement;
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                (this.params[key] as number) = value;
                label.textContent = value.toFixed(id === 'damp' || id === 'rad' ? 3 : 2);
            });
        };

        setupSlider('g', 'gVal', 'g');
        setupSlider('dt', 'dtVal', 'dt');
        setupSlider('damp', 'dampVal', 'damping');
        setupSlider('rep', 'repVal', 'repulsion');
        setupSlider('spin', 'spinVal', 'spin');
        setupSlider('rad', 'radVal', 'radiative');

        document.getElementById('startStop')?.addEventListener('click', () => {
            this.paused = !this.paused;
            (document.getElementById('startStop') as HTMLButtonElement).textContent = this.paused ? 'Start' : 'Pause';
        });
        document.getElementById('step')?.addEventListener('click', () => {
            if (!this.paused) {
                this.paused = true;
                (document.getElementById('startStop') as HTMLButtonElement).textContent = 'Start';
            }
            this.stepRequested = true;
        });
    }
}
