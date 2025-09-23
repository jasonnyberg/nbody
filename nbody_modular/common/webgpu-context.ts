export class WebGPUContext {
    public canvas: HTMLCanvasElement;
    public adapter: GPUAdapter | null;
    public device: GPUDevice | null;
    public context: GPUCanvasContext | null;
    public format: GPUTextureFormat | null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.adapter = null;
        this.device = null;
        this.context = null;
        this.format = null;
    }

    public async init(): Promise<this> {
        if (!('gpu' in navigator)) {
            throw new Error("WebGPU not supported on this browser.");
        }

        this.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!this.adapter) {
            throw new Error("Failed to get GPU adapter.");
        }

        try {
            this.device = await this.adapter.requestDevice({
                requiredLimits: { maxStorageBuffersPerShaderStage: 10 }
            });
        } catch (e) {
            console.warn("Could not obtain higher storage buffer limit, falling back to default device.", e);
            this.device = await this.adapter.requestDevice();
        }

        if (!this.device) {
            throw new Error("Failed to get GPU device.");
        }

        this.device.addEventListener('uncapturederror', (event) => {
            const gpuError = event as GPUUncapturedErrorEvent;
            console.error(`A WebGPU error was not captured: ${gpuError.error.message}`);
        });

        const context = this.canvas.getContext('webgpu');
        if (!context) {
            throw new Error("Could not get WebGPU context from canvas.");
        }
        this.context = context;
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.resize();
        window.addEventListener('resize', () => this.resize());

        return this;
    }

    public resize(): void {
        if (!this.context || !this.device || !this.format) {
            // Not initialized yet
            return;
        }
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const newWidth = Math.floor(this.canvas.clientWidth * dpr);
        const newHeight = Math.floor(this.canvas.clientHeight * dpr);

        if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;
            this.context.configure({ 
                device: this.device, 
                format: this.format, 
                alphaMode: 'opaque' 
            });
        }
    }
}