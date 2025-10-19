import { IPipeline, PipelineInput } from "../pipeline.js";
import { SimParams } from "../../main.js";
import { RenderModule } from "../common/render.js";
import { RenderMortonModule } from "./RenderMortonModule.js";
import { UniqueNodesModule } from "./UniqueNodesModule.js";
import { UniqueBoxesModule } from "./UniqueBoxesModule.js";
import { IntegrateModule } from "../direct_sum/integrate.js";

export class BarnesHutPipeline implements IPipeline {
    private device!: GPUDevice;

    private renderModule!: RenderModule;
    private renderMortonModule!: RenderMortonModule;
    private uniqueNodesModule!: UniqueNodesModule;
    private uniqueBoxesModule!: UniqueBoxesModule;
    private integrateModule!: IntegrateModule;

    // Global bounds reduction
    private globalBoundsPass1Pipeline!: GPUComputePipeline;
    private globalBoundsPass2Pipeline!: GPUComputePipeline;
    private cubifyBoundsPipeline!: GPUComputePipeline;
    private partialBoundsBuf!: GPUBuffer;
    private globalBoundsBuf!: GPUBuffer;
    private simParamsUniformBuf!: GPUBuffer;
    private numWorkgroups!: number;

    // Morton codes
    private mortonCodePipeline!: GPUComputePipeline;
    private mortonCodeBuf!: GPUBuffer;
    private mortonParamsBuf!: GPUBuffer;

    // Bitonic sort
    private bitonicSortPipeline!: GPUComputePipeline;
    private sortParamsUniformBuf!: GPUBuffer;

    // Unique nodes
    private nodeFlagsBuf!: GPUBuffer;
    private uniqueNodesParamsBuf!: GPUBuffer;
    private octreeLevel = 5;

    public async init(device: GPUDevice, format: GPUTextureFormat, params: SimParams): Promise<void> {
        this.device = device;

        this.renderModule = new RenderModule();
        await this.renderModule.init(device, format);

        this.renderMortonModule = new RenderMortonModule();
        await this.renderMortonModule.init(device, format);

        this.uniqueNodesModule = new UniqueNodesModule();
        await this.uniqueNodesModule.init(device);

        this.uniqueBoxesModule = new UniqueBoxesModule();
        await this.uniqueBoxesModule.init(device, format);

        this.integrateModule = new IntegrateModule();
        await this.integrateModule.init(device, params.wgSize);

        const wgSize = 256;
        this.numWorkgroups = Math.ceil(params.particleCount / wgSize);

        // Uniform buffer for simulation parameters
        this.simParamsUniformBuf = device.createBuffer({
            size: 4, // num_items
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Global bounds reduction pipeline
        this.partialBoundsBuf = device.createBuffer({
            size: this.numWorkgroups * 2 * 16, // 2 vec4s per workgroup
            usage: GPUBufferUsage.STORAGE,
        });
        this.globalBoundsBuf = device.createBuffer({
            size: 2 * 16, // final min and max
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const globalBoundsPass1Shader = await fetch('./pipelines/barnes_hut/shaders/global_bounds_pass1.wgsl').then(res => res.text());
        const globalBoundsPass1Module = device.createShaderModule({ code: globalBoundsPass1Shader });

        this.globalBoundsPass1Pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: globalBoundsPass1Module,
                entryPoint: 'main',
            },
        });

        const globalBoundsPass2Shader = await fetch('./pipelines/barnes_hut/shaders/global_bounds_pass2.wgsl').then(res => res.text());
        const globalBoundsPass2Module = device.createShaderModule({ code: globalBoundsPass2Shader });

        this.globalBoundsPass2Pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: globalBoundsPass2Module,
                entryPoint: 'main',
            },
        });

        const cubifyBoundsShader = await fetch('./pipelines/barnes_hut/shaders/cubify_bounds.wgsl').then(res => res.text());
        const cubifyBoundsModule = device.createShaderModule({ code: cubifyBoundsShader });

        this.cubifyBoundsPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: cubifyBoundsModule,
                entryPoint: 'main',
            },
        });

        // Morton code pipeline
        this.mortonCodeBuf = device.createBuffer({
            size: params.particleCount * 2 * 4, // vec2<u32>
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const mortonShader = await fetch('./pipelines/barnes_hut/shaders/morton.wgsl').then(res => res.text());
        const mortonModule = device.createShaderModule({ code: mortonShader });

        this.mortonCodePipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: mortonModule,
                entryPoint: 'main',
            },
        });

        const mortonParams = new Float32Array([
            this.octreeLevel, 0, 0, 0, // level
        ]);
        this.mortonParamsBuf = device.createBuffer({
            size: mortonParams.byteLength + 32, // room for scene_min and scene_max
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        device.queue.writeBuffer(this.mortonParamsBuf, 0, mortonParams);

        // Bitonic sort pipeline
        this.sortParamsUniformBuf = device.createBuffer({
            size: 8, // j, k
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bitonicSortShader = await fetch('./pipelines/barnes_hut/shaders/bitonic_sort.wgsl').then(res => res.text());
        const bitonicSortModule = device.createShaderModule({ code: bitonicSortShader });

        this.bitonicSortPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: bitonicSortModule,
                entryPoint: 'main',
            },
        });

        // Unique nodes pipeline
        const numNodes = 1 << (3 * this.octreeLevel);
        this.nodeFlagsBuf = device.createBuffer({
            size: numNodes * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const uniqueNodesParams = new Uint32Array([this.octreeLevel, params.particleCount]);
        this.uniqueNodesParamsBuf = device.createBuffer({
            size: uniqueNodesParams.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.uniqueNodesParamsBuf, 0, uniqueNodesParams);
    }

    public run(commandEncoder: GPUCommandEncoder, buffers: PipelineInput, params: SimParams, frameCount?: number): void {
        const wgSize = 256;
        const numWorkgroups = Math.ceil(params.particleCount / wgSize);

        const pass1 = commandEncoder.beginComputePass();
        pass1.setPipeline(this.globalBoundsPass1Pipeline);
        this.device.queue.writeBuffer(this.simParamsUniformBuf, 0, new Uint32Array([params.particleCount]));
        const bg1 = this.device.createBindGroup({
            layout: this.globalBoundsPass1Pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: buffers.posIn } },
                { binding: 1, resource: { buffer: this.partialBoundsBuf } },
                { binding: 2, resource: { buffer: this.simParamsUniformBuf } },
            ],
        });
        pass1.setBindGroup(0, bg1);
        pass1.dispatchWorkgroups(numWorkgroups);
        pass1.end();

        const pass2 = commandEncoder.beginComputePass();
        pass2.setPipeline(this.globalBoundsPass2Pipeline);
        this.device.queue.writeBuffer(this.simParamsUniformBuf, 0, new Uint32Array([numWorkgroups]));
        const bg2 = this.device.createBindGroup({
            layout: this.globalBoundsPass2Pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.partialBoundsBuf } },
                { binding: 1, resource: { buffer: this.globalBoundsBuf } },
                { binding: 2, resource: { buffer: this.simParamsUniformBuf } },
            ],
        });
        pass2.setBindGroup(0, bg2);
        pass2.dispatchWorkgroups(1);
        pass2.end();

        const cubifyPass = commandEncoder.beginComputePass();
        cubifyPass.setPipeline(this.cubifyBoundsPipeline);
        const cubifyBG = this.device.createBindGroup({
            layout: this.cubifyBoundsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.globalBoundsBuf } },
            ],
        });
        cubifyPass.setBindGroup(0, cubifyBG);
        cubifyPass.dispatchWorkgroups(1);
        cubifyPass.end();



        commandEncoder.copyBufferToBuffer(
            this.globalBoundsBuf, 0,
            this.mortonParamsBuf, 16, // offset for vec4 level
            32 // size of 2 vec4s
        );

        if (frameCount === 5) {
            const stagingBuffer = this.device.createBuffer({
                size: this.mortonParamsBuf.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });

            commandEncoder.copyBufferToBuffer(
                this.mortonParamsBuf, 0,
                stagingBuffer, 0,
                this.mortonParamsBuf.size
            );

            this.device.queue.onSubmittedWorkDone().then(() => {
                stagingBuffer.mapAsync(GPUMapMode.READ).then(() => {
                    const data = new Float32Array(stagingBuffer.getMappedRange());
                    console.log("Morton params (frame 5):");
                    console.log(`  level: ${data[0]}`);
                    console.log(`  scene_min: ${data[4]}, ${data[5]}, ${data[6]}`);
                    console.log(`  scene_max: ${data[8]}, ${data[9]}, ${data[10]}`);
                    stagingBuffer.unmap();
                    stagingBuffer.destroy();
                });
            });
        }



        // Morton code pass
        const mortonPass = commandEncoder.beginComputePass();
        mortonPass.setPipeline(this.mortonCodePipeline);
        this.device.queue.writeBuffer(this.simParamsUniformBuf, 0, new Uint32Array([params.particleCount]));
        const mortonBG = this.device.createBindGroup({
            layout: this.mortonCodePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: buffers.posIn } },
                { binding: 1, resource: { buffer: this.mortonCodeBuf } },
                { binding: 2, resource: { buffer: this.mortonParamsBuf } },
                { binding: 3, resource: { buffer: this.simParamsUniformBuf } },
            ],
        });
        mortonPass.setBindGroup(0, mortonBG);
        mortonPass.dispatchWorkgroups(numWorkgroups);
        mortonPass.end();

        // Bitonic sort pass
        const n = params.particleCount;
        const paddedN = 1 << Math.ceil(Math.log2(n));

        const sortBG = this.device.createBindGroup({
            layout: this.bitonicSortPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.mortonCodeBuf } },
                { binding: 1, resource: { buffer: this.sortParamsUniformBuf } },
            ],
        });

        const sortPass = commandEncoder.beginComputePass();
        sortPass.setPipeline(this.bitonicSortPipeline);
        sortPass.setBindGroup(0, sortBG);

        for (let k = 2; k <= paddedN; k *= 2) {
            for (let j = k / 2; j > 0; j /= 2) {
                this.device.queue.writeBuffer(this.sortParamsUniformBuf, 0, new Uint32Array([j, k]));
                sortPass.dispatchWorkgroups(Math.ceil(paddedN / 256));
            }
        }
        sortPass.end();





        // Unique nodes pass
        commandEncoder.clearBuffer(this.nodeFlagsBuf);
        const uniqueNodesPass = commandEncoder.beginComputePass();
        uniqueNodesPass.setPipeline(this.uniqueNodesModule.pipeline);
        const uniqueNodesBG = this.uniqueNodesModule.createBindGroup(this.device, {
            mortonCodes: this.mortonCodeBuf,
            nodeFlags: this.nodeFlagsBuf,
            params: this.uniqueNodesParamsBuf,
        });
        uniqueNodesPass.setBindGroup(0, uniqueNodesBG);
        uniqueNodesPass.dispatchWorkgroups(Math.ceil(params.particleCount / 256));
        uniqueNodesPass.end();

        // For now, use the direct sum integrator
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
        const computePass = commandEncoder.beginComputePass();
        this.integrateModule.run(computePass, integrateBG, params.particleCount, params.wgSize);
        computePass.end();
    }

    public render(renderPass: GPURenderPassEncoder, pos: GPUBuffer, masses: GPUBuffer, mats: GPUBuffer, params: SimParams): void {
        // Render particles
        const renderBG = this.renderModule.createBindGroup(this.device, {
            pos: pos,
            masses: masses,
            mats: mats,
        });
        this.renderModule.run(renderPass, renderBG, params.particleCount);

        // Render unique boxes
        const uniqueBoxesBG = this.uniqueBoxesModule.createBindGroup(this.device, {
            nodeFlags: this.nodeFlagsBuf,
            params: this.mortonParamsBuf, // reuse morton params for scene bounds
            mats: mats,
        });
        const numNodes = 1 << (3 * this.octreeLevel);
        this.uniqueBoxesModule.run(renderPass, uniqueBoxesBG, numNodes);
    }

    public destroy(): void {
        this.partialBoundsBuf.destroy();
        this.globalBoundsBuf.destroy();
        this.simParamsUniformBuf.destroy();
        this.mortonCodeBuf.destroy();
        this.mortonParamsBuf.destroy();
        this.sortParamsUniformBuf.destroy();
        this.nodeFlagsBuf.destroy();
        this.uniqueNodesParamsBuf.destroy();
    }
}