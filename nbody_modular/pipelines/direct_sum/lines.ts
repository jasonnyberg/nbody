interface LinesBuffers {
    pos: GPUBuffer;
    visPair: GPUBuffer;
    mats: GPUBuffer;
    outPairCount: GPUBuffer;
}

export class LinesModule {
    private pipeline: GPURenderPipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;

    public async init(device: GPUDevice, format: GPUTextureFormat): Promise<void> {
        const shaderCode = await fetch('./pipelines/direct_sum/shaders/lines-debug.wgsl').then(res => res.text());
        const shaderModule = device.createShaderModule({ code: shaderCode });

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
            primitive: { topology: 'line-list' }
        });

        this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);
    }

    public createBindGroup(device: GPUDevice, buffers: LinesBuffers): GPUBindGroup {
        if (!this.bindGroupLayout) {
            throw new Error("Bind group layout not created");
        }
        return device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: buffers.pos } },
                { binding: 1, resource: { buffer: buffers.visPair } },
                { binding: 2, resource: { buffer: buffers.mats } },
                { binding: 3, resource: { buffer: buffers.outPairCount } },
            ]
        });
    }

    public run(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup, maxPairs: number): void {
        if (!this.pipeline) {
            throw new Error("Pipeline not created");
        }
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(2, maxPairs);
    }
}