interface BoxesBuffers {
    node: GPUBuffer;
    mats: GPUBuffer;
}

export class BoxesModule {
    private pipeline: GPURenderPipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;

    public async init(device: GPUDevice, format: GPUTextureFormat, bucketCount: number): Promise<void> {
        const shaderCode = await fetch('./pipelines/direct_sum/shaders/boxes-debug.wgsl').then(res => res.text());
        const shaderModule = device.createShaderModule({
            code: shaderCode.replace(/\$\{bucketCount\}/g, bucketCount.toString())
        });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: shaderModule, entryPoint: 'vs' },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs',
                targets: [{
                    format: format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            primitive: { topology: 'line-list', cullMode: 'none' }
        });

        this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);
    }

    public createBindGroup(device: GPUDevice, buffers: BoxesBuffers): GPUBindGroup {
        if (!this.bindGroupLayout) {
            throw new Error("Bind group layout not created");
        }
        return device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: buffers.node } },
                { binding: 1, resource: { buffer: buffers.mats } },
            ]
        });
    }

    public run(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup, bucketCount: number): void {
        if (!this.pipeline) {
            throw new Error("Pipeline not created");
        }
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(24, bucketCount);
    }
}