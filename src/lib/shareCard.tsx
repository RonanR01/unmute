import { renderToStaticMarkup } from "react-dom/server";
import { HelpCircle } from "lucide-react";
import { PICTOGRAMS } from "@/components/badges/BadgeEmblem";
import { FLOWS } from "@/components/shared/TopoLines";

/** Portrait, 4:5: the tallest image LinkedIn and Instagram show uncropped. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const GROUND = "#0e2a22";
const INK = "#f4f7f6";
const MUTED = "#a8c0b6";
const SIGNAL = "#ffd60a";
const FONT = '"Rethink Sans Variable", system-ui, sans-serif';
const MARGIN = 88;

/** Text already in the user's language; a card draws, it doesn't translate. */
export interface BadgeCard {
  kind: "badge";
  badgeId: string;
  /** "Badge earned" */
  label: string;
  name: string;
  description: string;
  /** "Earned on 16 November 2026" */
  date: string;
  /** The belt, as the footer's second line. */
  standing: string;
}

export interface InsightsCard {
  kind: "insights";
  title: string;
  figures: { label: string; value: string; unit?: string }[];
  /** "My catchphrase", then the phrase itself; left out when unknown. */
  catchphrase?: { label: string; text: string };
  standing: string;
}

export type ShareCard = BadgeCard | InsightsCard;

type Context = CanvasRenderingContext2D;

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

/** `text` broken into lines no wider than `width`, in the current font. */
const wrap = (ctx: Context, text: string, width: number): string[] => {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

/** Draws centered lines from `y` down and returns the y under the last. */
const paragraph = (
  ctx: Context,
  text: string,
  y: number,
  lineHeight: number,
  maxLines = 4,
): number => {
  const lines = wrap(ctx, text, CARD_WIDTH - 2 * MARGIN).slice(0, maxLines);
  lines.forEach((line, index) =>
    ctx.fillText(line, CARD_WIDTH / 2, y + index * lineHeight),
  );
  return y + lines.length * lineHeight;
};

const drawGround = (ctx: Context) => {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // The topographic lines, tiled down the card.
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.09;
  ctx.lineWidth = 1.6;
  const scale = CARD_WIDTH / 1000;
  for (let band = 0; band * 250 * scale < CARD_HEIGHT; band++) {
    ctx.save();
    ctx.translate(-20, band * 250 * scale);
    ctx.scale(scale, scale);
    for (const flow of FLOWS) ctx.stroke(new Path2D(flow));
    ctx.restore();
  }
  ctx.restore();
};

const drawLogo = (ctx: Context) => {
  const size = 64;
  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  ctx.scale(size / 28, size / 28);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(14, 14, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.stroke(new Path2D("M5 12c3-3 5 2 9 0s6-3 9 0"));
  ctx.stroke(new Path2D("M6 17c3-2 5 2 8 0s5-2 8 0"));
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.font = font(700, 48);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("unwrite", MARGIN + size + 20, MARGIN + size / 2 + 2);
};

const drawFooter = (ctx: Context, standing: string) => {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = font(600, 34);
  ctx.fillText(standing, CARD_WIDTH / 2, CARD_HEIGHT - MARGIN);
};

/** A lucide pictogram as an image the canvas can draw. */
const loadPictogram = (badgeId: string, size: number) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const Pictogram = PICTOGRAMS[badgeId] ?? HelpCircle;
    const svg = renderToStaticMarkup(
      <Pictogram size={size} color={GROUND} strokeWidth={1.5} />,
    );
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("pictogram failed to load"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

const drawBadge = async (ctx: Context, card: BadgeCard) => {
  const center = { x: CARD_WIDTH / 2, y: 500 };
  const radius = 215;

  // An earned medal is a signal yellow disc drawn on in fir.
  ctx.fillStyle = SIGNAL;
  ctx.strokeStyle = GROUND;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius - 32, 0, Math.PI * 2);
  ctx.stroke();
  // The medal's waves, from BadgeEmblem's 64-unit drawing.
  ctx.translate(center.x - radius * (32 / 30), center.y - radius * (32 / 30));
  ctx.scale(radius / 30, radius / 30);
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D("M9 44c7-5 11 3 19 0s12-5 18-1 7 2 9 0"));
  ctx.globalAlpha = 0.28;
  ctx.stroke(new Path2D("M12 50c6-4 10 2 17 0s11-4 16-1 5 1 7 0"));
  ctx.restore();

  const pictogram = 200;
  const image = await loadPictogram(card.badgeId, pictogram);
  ctx.drawImage(
    image,
    center.x - pictogram / 2,
    center.y - pictogram / 2 - 24,
    pictogram,
    pictogram,
  );

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 36);
  ctx.fillText(card.label, CARD_WIDTH / 2, 830);

  ctx.fillStyle = INK;
  ctx.font = font(700, 80);
  let y = paragraph(ctx, card.name, 930, 88, 2);

  ctx.fillStyle = MUTED;
  ctx.font = font(400, 38);
  y = paragraph(ctx, card.description, y - 18, 52, 3);

  ctx.font = font(500, 30);
  ctx.fillText(card.date, CARD_WIDTH / 2, y + 18);
};

const drawInsights = (ctx: Context, card: InsightsCard) => {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = font(700, 68);
  paragraph(ctx, card.title, 290, 76, 2);

  let y = 420;
  for (const figure of card.figures) {
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 34);
    ctx.fillText(figure.label, CARD_WIDTH / 2, y);

    // The value in signal yellow, its unit beside it in grey, centered as one.
    ctx.font = font(700, 116);
    const valueWidth = ctx.measureText(figure.value).width;
    ctx.font = font(500, 36);
    const unit = figure.unit ? ` ${figure.unit}` : "";
    const unitWidth = ctx.measureText(unit).width;
    const left = (CARD_WIDTH - valueWidth - unitWidth) / 2;

    ctx.textAlign = "left";
    ctx.fillStyle = SIGNAL;
    ctx.font = font(700, 116);
    ctx.fillText(figure.value, left, y + 116);
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 36);
    ctx.fillText(unit, left + valueWidth, y + 116);
    ctx.textAlign = "center";
    y += 200;
  }

  if (card.catchphrase) {
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 34);
    ctx.fillText(card.catchphrase.label, CARD_WIDTH / 2, y + 20);
    ctx.fillStyle = INK;
    ctx.font = font(700, 56);
    paragraph(ctx, `« ${card.catchphrase.text} »`, y + 92, 64, 1);
  }
};

/** Draws `card` and returns it as a PNG. */
export const renderShareCard = async (card: ShareCard): Promise<Blob> => {
  // Canvas text falls back to a system font until the web font has loaded.
  await document.fonts.load(font(700, 80));
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  drawGround(ctx);
  drawLogo(ctx);
  if (card.kind === "badge") await drawBadge(ctx, card);
  else drawInsights(ctx, card);
  drawFooter(ctx, card.standing);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("no image"))),
      "image/png",
    ),
  );
};
