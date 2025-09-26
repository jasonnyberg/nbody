interface UniqueNodesBuffers {
    mortonCodes: GPUBuffer;
    nodeFlags: GPUBuffer;
    params: GPUBuffer;
}

export class UniqueNodesModule {
    public pipeline!: GPUComputePipeline;

    public async init(device: GPUDevice) {
        const shader = await fetch('./pipelines/barnes_hut/shaders/unique_nodes.wgsl').then(res => res.text());
        const module = device.createShaderModule({ code: shader });

        this.pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: module,
                entryPoint: 'main',
            },
        });
    }

    public createBindGroup(device: GPUDevice, buffers: UniqueNodesBuffers): GPUBindGroup {
        return device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: buffers.mortonCodes } },
                { binding: 1, resource: { buffer: buffers.nodeFlags } },
                { binding: 2, resource: { buffer: buffers.params } },
            ],
        });
    }

    public run(passEncoder: GPUComputePassEncoder, bindGroup: GPUBindGroup, numParticles: number) {
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(numParticles / 256));
    }
}