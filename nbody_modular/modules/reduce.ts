interface ReduceBuffers {
    pos: GPUBuffer;
    node: GPUBuffer;
    nodeParams: GPUBuffer;
}

export class ReduceModule {
    private pipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;

    public async init(device: GPUDevice): Promise<void> {
        const shaderCode = await fetch('./shaders/reduce-debug.wgsl').then(res => res.text());
        const shaderModule = device.createShaderModule({ code: shaderCode });

        this.pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: 'main' }
        });

        this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);
    }

    public createBindGroup(device: GPUDevice, buffers: ReduceBuffers): GPUBindGroup {
        if (!this.bindGroupLayout) {
            throw new Error("Bind group layout not created");
        }
        return device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: buffers.pos } },
                { binding: 1, resource: { buffer: buffers.node } },
                { binding: 2, resource: { buffer: buffers.nodeParams } },
            ]
        });
    }

    public run(passEncoder: GPUComputePassEncoder, bindGroup: GPUBindGroup, bucketCount: number): void {
        if (!this.pipeline) {
            throw new Error("Pipeline not created");
        }
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(bucketCount);
    }
}