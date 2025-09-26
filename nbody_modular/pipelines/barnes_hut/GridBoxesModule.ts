import { SimParams } from "../../main.js";

interface GridBoxesBuffers {
    grid: GPUBuffer;
    gridParams: GPUBuffer;
    mats: GPUBuffer;
}

export class GridBoxesModule {
    private pipeline!: GPURenderPipeline;

    public async init(device: GPUDevice, format: GPUTextureFormat) {
        const shader = await fetch('./pipelines/barnes_hut/shaders/grid_boxes.wgsl').then(res => res.text());
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

    public createBindGroup(device: GPUDevice, buffers: GridBoxesBuffers): GPUBindGroup {
        return device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: buffers.grid } },
                { binding: 1, resource: { buffer: buffers.gridParams } },
                { binding: 2, resource: { buffer: buffers.mats } },
            ],
        });
    }

    public run(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup, gridResolution: number) {
        const gridSize = gridResolution * gridResolution * gridResolution;
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(24, gridSize);
    }
}
