import { vec3, mat4, ReadonlyVec3 } from './gl-matrix-util.js';

export class OrbitCamera {
    private canvas: HTMLCanvasElement;
    public distance: number;
    public azimuth: number;
    public elevation: number;
    public viewMatrix: mat4;
    public projMatrix: mat4;

    constructor(canvas: HTMLCanvasElement, distance = 2000) {
        this.canvas = canvas;
        this.distance = distance;
        this.azimuth = 0.3;
        this.elevation = 0.6;

        this.viewMatrix = mat4.create();
        this.projMatrix = mat4.create();

        this.initControls();
        this.updateViewMatrix();
    }

    private initControls(): void {
        let dragging = false;
        let lastX = 0, lastY = 0;

        this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button === 0) {
                dragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
            }
        });

        window.addEventListener('mouseup', () => { dragging = false; });

        window.addEventListener('mousemove', (e: MouseEvent) => {
            if (!dragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;

            this.azimuth += dx * 0.005;
            this.elevation += dy * 0.005;
            this.elevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.elevation));
        });

        this.canvas.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            this.distance *= Math.exp(e.deltaY * 0.001);
            this.distance = Math.max(10, Math.min(1e6, this.distance));
            this.updateViewMatrix();
        }, { passive: false });
    }

    public updateViewMatrix(): void {
        const eye = vec3.create();
        const center = vec3.fromValues(0, 0, 0);
        const up = vec3.fromValues(0, 1, 0);

        const ce = Math.cos(this.elevation);
        const se = Math.sin(this.elevation);
        const sa = Math.sin(this.azimuth);
        const ca = Math.cos(this.azimuth);

        vec3.set(eye, this.distance * ce * sa, this.distance * se, this.distance * ce * ca);
        mat4.lookAt(this.viewMatrix, eye, center, up);
    }

    public getViewMatrix(): mat4 {
        return this.viewMatrix;
    }

    public getProjectionMatrix(aspect: number): mat4 {
        mat4.perspective(this.projMatrix, Math.PI / 4, aspect, 0.1, 1e7);
        return this.projMatrix;
    }
}