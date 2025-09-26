import { IPipeline, PipelineInput } from "../pipeline.js";
import { SimParams } from "../../main.js";
import { RenderModule } from "../common/render.js";
import { GridModule } from "./GridModule.js";
import { GridBoxesModule } from "./GridBoxesModule.js";

export class BarnesHutPipeline implements IPipeline {
    private device!: GPUDevice;

    private renderModule!: RenderModule;
    private gridModule!: GridModule;
    private gridBoxesModule!: GridBoxesModule;

    private gridBuf!: GPUBuffer;
    private gridParamsBuf!: GPUBuffer;
    private gridResolution = 16;

    public async init(device: GPUDevice, format: GPUTextureFormat, params: SimParams): Promise<void> {
        this.device = device;

        this.renderModule = new RenderModule();
        await this.renderModule.init(device, format);

        this.gridModule = new GridModule();
        await this.gridModule.init(device);

        this.gridBoxesModule = new GridBoxesModule();
        await this.gridBoxesModule.init(device, format);

        const gridSize = this.gridResolution * this.gridResolution * this.gridResolution;
        this.gridBuf = device.createBuffer({
            size: gridSize * 4, // atomic<u32>
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const gridParams = new Float32Array([
            this.gridResolution, 0, 0, 0, // resolution
            -1000, -1000, -1000, 0, // scene_min
            1000, 1000, 1000, 0, // scene_max
            params.particleCount, 0, 0, 0,
        ]);
        this.gridParamsBuf = device.createBuffer({
            size: gridParams.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.gridParamsBuf, 0, gridParams);
    }

    public run(commandEncoder: GPUCommandEncoder, buffers: PipelineInput, params: SimParams): void {
        const gridSize = this.gridResolution * this.gridResolution * this.gridResolution;
        commandEncoder.clearBuffer(this.gridBuf, 0, gridSize * 4);

        const gridPass = commandEncoder.beginComputePass();
        const gridBG = this.gridModule.createBindGroup(this.device, {
            particles: buffers.posIn,
            grid: this.gridBuf,
            gridParams: this.gridParamsBuf,
        });
        this.gridModule.run(gridPass, gridBG, params.particleCount);
        gridPass.end();

        // For now, the Barnes-Hut pipeline does not include an integrator.
        // I will just copy the input to the output.
        commandEncoder.copyBufferToBuffer(buffers.posIn, 0, buffers.posOut, 0, params.particleCount * 4 * 4);
        commandEncoder.copyBufferToBuffer(buffers.velIn, 0, buffers.velOut, 0, params.particleCount * 4 * 4);
    }

    public render(renderPass: GPURenderPassEncoder, pos: GPUBuffer, masses: GPUBuffer, mats: GPUBuffer, params: SimParams): void {
        // Render particles
        const renderBG = this.renderModule.createBindGroup(this.device, {
            pos: pos,
            masses: masses,
            mats: mats,
        });
        this.renderModule.run(renderPass, renderBG, params.particleCount);

        // Render grid boxes
        const gridBoxesBG = this.gridBoxesModule.createBindGroup(this.device, {
            grid: this.gridBuf,
            gridParams: this.gridParamsBuf,
            mats: mats,
        });
        this.gridBoxesModule.run(renderPass, gridBoxesBG, this.gridResolution);
    }
}