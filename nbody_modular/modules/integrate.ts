interface IntegrateBuffers {
    posIn: GPUBuffer;
    prevPosIn: GPUBuffer;
    posOut: GPUBuffer;
    prevPosOut: GPUBuffer;
    simParams: GPUBuffer;
    masses: GPUBuffer;
    damp: GPUBuffer;
    repulse: GPUBuffer;
    rad: GPUBuffer;
    spin: GPUBuffer;
}

export class IntegrateModule {
    private pipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;

    public async init(device: GPUDevice, wgSize: number): Promise<void> {
        const shaderCode = await fetch('./shaders/integrate-debug.wgsl').then(res => res.text());
        const shaderModule = device.createShaderModule({
            code: shaderCode.replace(/\$\{WG_SIZE\}/g, wgSize.toString())
        });

        this.pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: shaderModule,
                entryPoint: 'main'
            }
        });

        this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);
    }

    public createBindGroup(device: GPUDevice, buffers: IntegrateBuffers): GPUBindGroup {
        if (!this.bindGroupLayout) {
            throw new Error("Bind group layout not created");
        }
        return device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: buffers.posIn } },
                { binding: 1, resource: { buffer: buffers.prevPosIn } },
                { binding: 2, resource: { buffer: buffers.posOut } },
                { binding: 3, resource: { buffer: buffers.prevPosOut } },
                { binding: 4, resource: { buffer: buffers.simParams } },
                { binding: 5, resource: { buffer: buffers.masses } },
                { binding: 6, resource: { buffer: buffers.damp } },
                { binding: 7, resource: { buffer: buffers.repulse } },
                { binding: 8, resource: { buffer: buffers.rad } },
                { binding: 9, resource: { buffer: buffers.spin } },
            ]
        });
    }

    public run(passEncoder: GPUComputePassEncoder, bindGroup: GPUBindGroup, particleCount: number, wgSize: number): void {
        if (!this.pipeline) {
            throw new Error("Pipeline not created");
        }
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(particleCount / wgSize));
    }
}