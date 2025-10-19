import { SimParams } from "../main.js";

export interface PipelineInput {
    posIn: GPUBuffer;
    velIn: GPUBuffer;
    posOut: GPUBuffer;
    velOut: GPUBuffer;
    masses: GPUBuffer;
    simParams: GPUBuffer;
    damp: GPUBuffer;
    repulse: GPUBuffer;
    rad: GPUBuffer;
    spin: GPUBuffer;
}

export interface IPipeline {
    init(device: GPUDevice, format: GPUTextureFormat, params: SimParams): Promise<void>;
    run(commandEncoder: GPUCommandEncoder, buffers: PipelineInput, params: SimParams, frameCount?: number): void;
    render(renderPass: GPURenderPassEncoder, pos: GPUBuffer, masses: GPUBuffer, mats: GPUBuffer, params: SimParams): void;
    destroy(): void;
}