export async function copyImageBlobToClipboard(blob: Blob) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("当前浏览器不支持复制图片");
    }
    const imageBlob = blob.type === "image/png" ? blob : await convertImageBlobToPng(blob);
    await navigator.clipboard.write([new ClipboardItem({ [imageBlob.type || "image/png"]: imageBlob })]);
}

async function convertImageBlobToPng(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法读取图片内容");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("图片复制失败"))), "image/png");
    });
}
