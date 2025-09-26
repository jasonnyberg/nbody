import { SimParams } from "../../main.js";

interface GridBuffers {
    particles: GPUBuffer;
    grid: GPUBuffer;
    gridParams: GPUBuffer;
}

export class GridModule {
    private pipeline!: GPUComputePipeline;

    public async init(device: GPUDevice) {
        const shader = await fetch('./pipelines/barnes_hut/shaders/regular_grid.wgsl').then(res => res.text());
        const module = device.createShaderModule({ code: shader });

        this.pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: module,
                entryPoint: 'main',
            },
        });
    }

    public createBindGroup(device: GPUDevice, buffers: GridBuffers): GPUBindGroup {
        return device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: buffers.particles } },
                { binding: 1, resource: { buffer: buffers.grid } },
                { binding: 2, resource: { buffer: buffers.gridParams } },
            ],
        });
    }

    public run(passEncoder: GPUComputePassEncoder, bindGroup: GPUBindGroup, numParticles: number) {
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(numParticles / 256));
    }
}
