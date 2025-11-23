import jsPDF from "jspdf";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import type { ThreeExportContext } from "../store/exportStore";

const renderSceneToCanvas = (ctx: ThreeExportContext) => {
  const { gl, scene, camera } = ctx;
  gl.render(scene, camera);
  return gl.domElement;
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportPng = (ctx: ThreeExportContext, filename = "konfigurator.png") => {
  const canvas = renderSceneToCanvas(ctx);
  const dataURL = canvas.toDataURL("image/png");
  downloadDataUrl(dataURL, filename);
  return dataURL;
};

export const exportPdf = (ctx: ThreeExportContext, title = "Stand-Konfiguration") => {
  const canvas = renderSceneToCanvas(ctx);
  const dataURL = canvas.toDataURL("image/png");
  const pdf = new jsPDF("landscape", "mm", "a4");
  pdf.addImage(dataURL, "PNG", 0, 0, 297, 210);
  pdf.text(title, 10, 200);
  pdf.save("stand-konfiguration.pdf");
};

export const exportGlb = (ctx: ThreeExportContext, filename = "stand.glb") => {
  const exporter = new GLTFExporter();
  exporter.parse(
    ctx.scene,
    (gltf) => {
      const data = gltf instanceof ArrayBuffer ? gltf : JSON.stringify(gltf, null, 2);
      const mime = gltf instanceof ArrayBuffer ? "model/gltf-binary" : "application/json";
      const blob = new Blob([data], { type: mime });
      downloadBlob(blob, filename);
    },
    console.error,
    { binary: true }
  );
};

export const exportObj = (ctx: ThreeExportContext, filename = "stand.obj") => {
  const exporter = new OBJExporter();
  const objString = exporter.parse(ctx.scene);
  const blob = new Blob([objString], { type: "text/plain" });
  downloadBlob(blob, filename);
};
