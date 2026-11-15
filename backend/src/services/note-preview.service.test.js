import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument, rgb } from "pdf-lib";
import { renderPdfFirstPagePreview } from "./note-preview.service.js";

test("renders a bounded PNG preview of the first PDF page", async () => {
  const document = await PDFDocument.create();
  const firstPage = document.addPage([300, 400]);
  firstPage.drawRectangle({
    x: 30,
    y: 40,
    width: 120,
    height: 90,
    color: rgb(1, 0, 0),
  });
  document.addPage([900, 1200]);

  const preview = await renderPdfFirstPagePreview(Buffer.from(await document.save()));
  const image = await loadImage(preview);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);

  assert.equal(preview.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(image.width, 300);
  assert.equal(image.height, 400);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let redPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] > 200 && pixels[index + 1] < 80 && pixels[index + 2] < 80) {
      redPixels += 1;
    }
  }
  assert.ok(redPixels > 1000, "the preview contains the actual first-page content");
});

test("rejects empty or oversized PDF preview inputs", async () => {
  await assert.rejects(renderPdfFirstPagePreview(Buffer.alloc(0)), /size limit/);
  await assert.rejects(
    renderPdfFirstPagePreview(Buffer.alloc(10 * 1024 * 1024 + 1)),
    /size limit/,
  );
});
