import { IPipeline, PipelineInput } from "../pipeline.js";
import { SimParams } from "../../main.js";
import { IntegrateModule } from "./integrate.js";
import { ReduceModule } from "./reduce.js";
import { LinesModule } from "./lines.js";
import { BoxesModule } from "./boxes.js";
import { RenderModule } from "../common/render.js";

export class DirectSumPipeline implements IPipeline {
    private device!: GPUDevice;

    private integrateModule!: IntegrateModule;
    private reduceModule!: ReduceModule;
    private linesModule!: LinesModule;
    private boxesModule!: BoxesModule;
    private renderModule!: RenderModule;

    private nodeBuf!: GPUBuffer;
    private nodeParamsBuf!: GPUBuffer;
    private visPairBuf!: GPUBuffer;
    private outPairCountBuf!: GPUBuffer;

    public async init(device: GPUDevice, format: GPUTextureFormat, params: SimParams): Promise<void> {
        this.device = device;

        this.integrateModule = new IntegrateModule();
        await this.integrateModule.init(device, params.wgSize);

        this.reduceModule = new ReduceModule();
        await this.reduceModule.init(device);

        this.linesModule = new LinesModule();
        await this.linesModule.init(device, format);

        this.boxesModule = new BoxesModule();
        await this.boxesModule.init(device, format, params.bucketCount);

        this.renderModule = new RenderModule();
        await this.renderModule.init(device, format);

        // Create internal buffers
        this.nodeBuf = device.createBuffer({ size: params.bucketCount * 2 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        const nodeParams = new Float32Array([params.particleCount, params.bucketSize, params.bucketCount, 0]);
        this.nodeParamsBuf = device.createBuffer({
            size: nodeParams.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Float32Array(this.nodeParamsBuf.getMappedRange()).set(nodeParams);
        this.nodeParamsBuf.unmap();

        this.visPairBuf = device.createBuffer({ size: params.maxPairs * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.outPairCountBuf = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

        const allPairs = new Uint32Array(params.maxPairs * 4);
        let pIdx = 0;
        for (let i = 0; i < params.particleCount; i++) {
            for (let j = i + 1; j < params.particleCount; j++) {
                const o = pIdx * 4;
                allPairs[o] = i; allPairs[o + 1] = j;
                pIdx++;
            }
        }
        device.queue.writeBuffer(this.visPairBuf, 0, allPairs);
        device.queue.writeBuffer(this.outPairCountBuf, 0, new Uint32Array([pIdx]));
    }

    public run(commandEncoder: GPUCommandEncoder, buffers: PipelineInput, params: SimParams): void {
        const computePass = commandEncoder.beginComputePass();

        const integrateBG = this.integrateModule.createBindGroup(this.device, {
            posIn: buffers.posIn,
            velIn: buffers.velIn,
            posOut: buffers.posOut,
            velOut: buffers.velOut,
            simParams: buffers.simParams,
            masses: buffers.masses,
            damp: buffers.damp,
            repulse: buffers.repulse,
            rad: buffers.rad,
            spin: buffers.spin,
        });
        this.integrateModule.run(computePass, integrateBG, params.particleCount, params.wgSize);

        const reduceBG = this.reduceModule.createBindGroup(this.device, {
            pos: buffers.posOut, // use the new positions
            node: this.nodeBuf,
            nodeParams: this.nodeParamsBuf,
        });
        this.reduceModule.run(computePass, reduceBG, params.bucketCount);

        computePass.end();
    }

    public render(renderPass: GPURenderPassEncoder, pos: GPUBuffer, masses: GPUBuffer, mats: GPUBuffer, params: SimParams): void {
        const renderBG = this.renderModule.createBindGroup(this.device, {
            pos: pos,
            masses: masses,
            mats: mats,
        });
        this.renderModule.run(renderPass, renderBG, params.particleCount);

        const linesBG = this.linesModule.createBindGroup(this.device, {
            pos: pos,
            visPair: this.visPairBuf,
            mats: mats,
            outPairCount: this.outPairCountBuf,
        });
        this.linesModule.run(renderPass, linesBG, params.maxPairs);

        const boxesBG = this.boxesModule.createBindGroup(this.device, {
            node: this.nodeBuf,
            mats: mats,
        });
        this.boxesModule.run(renderPass, boxesBG, params.bucketCount);
    }

    public destroy(): void {
        this.nodeBuf.destroy();
        this.nodeParamsBuf.destroy();
        this.visPairBuf.destroy();
        this.outPairCountBuf.destroy();
    }
}
