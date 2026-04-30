const QR_SIZE = 256;
const PADDING = 24;
const LINE_HEIGHT = 20;
const FONT = '16px sans-serif';
const MAX_LINES = 2;

/**
 * Splits a title into up to two lines (word wrap).
 * On overflow, the second line is truncated with "…".
 */
function wrapTitleIntoLines(
  ctx: CanvasRenderingContext2D,
  title: string,
  maxWidth: number
): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        if (lines.length === MAX_LINES) {
          lines[1] = lines[1] + '…';
          return lines;
        }
      }
      if (ctx.measureText(word).width <= maxWidth) {
        currentLine = word;
      } else {
        let truncated = word;
        while (
          truncated.length > 0 &&
          ctx.measureText(truncated + '…').width > maxWidth
        ) {
          truncated = truncated.slice(0, -1);
        }
        lines.push(truncated ? truncated + '…' : '…');
        return lines;
      }
    }
  }
  if (currentLine && lines.length < MAX_LINES) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Draws the product name (up to two lines) below the QR area.
 */
function drawTitleLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  options: {
    centerX: number;
    textAreaTop: number;
    lineHeight: number;
    maxTextWidth: number;
  }
): void {
  const { centerX, textAreaTop, lineHeight, maxTextWidth } = options;
  ctx.fillStyle = '#000000';
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  lines.forEach((line, i) => {
    const y = textAreaTop + lineHeight / 2 + i * lineHeight;
    ctx.fillText(line, centerX, y, maxTextWidth);
  });
}

/**
 * Generates a PNG from the SVG QR code and product name, then triggers the download.
 * @param svgElementId ID of the SVG element (e.g. "product-qr-code")
 * @param productTitle Product name, shown below the QR code (up to 2 lines)
 */
export function downloadProductQRCodePng(
  svgElementId: string,
  productTitle: string
): void {
  const svg = document.getElementById(svgElementId);
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const textHeight = MAX_LINES * LINE_HEIGHT;
  const canvasWidth = QR_SIZE + 2 * PADDING;
  const canvasHeight = PADDING + QR_SIZE + PADDING + textHeight + PADDING;

  const img = new Image();
  img.onload = () => {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(img, PADDING, PADDING, QR_SIZE, QR_SIZE);

    const centerX = canvasWidth / 2;
    const textAreaTop = PADDING + QR_SIZE + PADDING;
    const lines = wrapTitleIntoLines(ctx, productTitle, QR_SIZE);
    drawTitleLines(ctx, lines, {
      centerX,
      textAreaTop,
      lineHeight: LINE_HEIGHT,
      maxTextWidth: QR_SIZE,
    });

    const pngDataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `QR-Code-${productTitle.replace(/\s+/g, '-')}.png`;
    link.href = pngDataUrl;
    link.click();
  };

  img.src =
    'data:image/svg+xml;base64,' +
    btoa(unescape(encodeURIComponent(svgData)));
}
