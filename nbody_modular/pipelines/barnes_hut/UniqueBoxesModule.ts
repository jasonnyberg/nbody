interface UniqueBoxesBuffers {
    nodeFlags: GPUBuffer;
    params: GPUBuffer;
    mats: GPUBuffer;
}

export class UniqueBoxesModule {
    private pipeline!: GPURenderPipeline;

    public async init(device: GPUDevice, format: GPUTextureFormat) {
        const shader = await fetch('./pipelines/barnes_hut/shaders/unique_boxes.wgsl').then(res => res.text());
        const module = device.createShaderModule({ code: shader });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: module,
                entryPoint: 'vs',
            },
            fragment: {
                module: module,
                entryPoint: 'fs',
                targets: [{
                    format: format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            primitive: { topology: 'line-list' },
        });
    }

    public createBindGroup(device: GPUDevice, buffers: UniqueBoxesBuffers): GPUBindGroup {
        return device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: buffers.nodeFlags } },
                { binding: 1, resource: { buffer: buffers.params } },
                { binding: 2, resource: { buffer: buffers.mats } },
            ],
        });
    }

    public run(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup, numNodes: number) {
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(24, numNodes);
    }
}
