import { IPipeline, PipelineInput } from "../pipeline.js";
import { SimParams } from "../../main.js";
import { RenderModule } from "../common/render.js";
import { RenderMortonModule } from "./RenderMortonModule.js";
import { UniqueNodesModule } from "./UniqueNodesModule.js";
import { UniqueBoxesModule } from "./UniqueBoxesModule.js";

export class BarnesHutPipeline implements IPipeline {
    private device!: GPUDevice;

    private renderModule!: RenderModule;
    private renderMortonModule!: RenderMortonModule;
    private uniqueNodesModule!: UniqueNodesModule;
    private uniqueBoxesModule!: UniqueBoxesModule;

    // Global bounds reduction
    private globalBoundsPass1Pipeline!: GPUComputePipeline;
    private globalBoundsPass2Pipeline!: GPUComputePipeline;
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

        // Morton code pipeline
        this.mortonCodeBuf = device.createBuffer({
            size: params.particleCount * 2 * 4, // vec2<u32>
            usage: GPUBufferUsage.STORAGE,
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
            -1000, -1000, -1000, 0, // scene_min
            1000, 1000, 1000, 0, // scene_max
        ]);
        this.mortonParamsBuf = device.createBuffer({
            size: mortonParams.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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

    public run(commandEncoder: GPUCommandEncoder, buffers: PipelineInput, params: SimParams): void {
        const wgSize = 256;
        const numWorkgroups = Math.ceil(params.particleCount / wgSize);

        // Pass 1: Reduce in workgroups
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

        // Pass 2: Reduce the partial bounds
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

        // Morton code pass
        const mortonPass = commandEncoder.beginComputePass();
        mortonPass.setPipeline(this.mortonCodePipeline);
        this.device.queue.writeBuffer(this.simParamsUniformBuf, 0, new Uint32Array([params.particleCount]));
        const mortonBG = this.device.createBindGroup({
            layout: this.mortonCodePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: buffers.posIn } },
                { binding: 1, resource: { buffer: this.mortonCodeBuf } },
                { binding: 2, resource: { buffer: this.globalBoundsBuf } },
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

        // For now, the Barnes-Hut pipeline does not include an integrator.
        // I will just copy the input to the output.
        commandEncoder.copyBufferToBuffer(buffers.posIn, 0, buffers.posOut, 0, params.particleCount * 4 * 4);
        commandEncoder.copyBufferToBuffer(buffers.velIn, 0, buffers.velOut, 0, params.particleCount * 4 * 4);
    }

    public render(renderPass: GPURenderPassEncoder, pos: GPUBuffer, masses: GPUBuffer, mats: GPUBuffer, params: SimParams): void {
        // Render particles sorted by morton code
        const renderMortonBG = this.renderMortonModule.createBindGroup(this.device, {
            particles: pos,
            mortonCodes: this.mortonCodeBuf,
            mats: mats,
        });
        this.renderMortonModule.run(renderPass, renderMortonBG, params.particleCount);

        // Render unique boxes
        const uniqueBoxesBG = this.uniqueBoxesModule.createBindGroup(this.device, {
            nodeFlags: this.nodeFlagsBuf,
            params: this.mortonParamsBuf, // reuse morton params for scene bounds
            mats: mats,
        });
        const numNodes = 1 << (3 * this.octreeLevel);
        this.uniqueBoxesModule.run(renderPass, uniqueBoxesBG, numNodes);
    }
}
