import { Chart } from './Chart';
import type { ChartScene } from './scene';

export interface ShareCardProps {
  city: string;
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  text: string;
  seed: string;
  scene: ChartScene;
  starCount: number;
  /** 二维码 PNG（data URL），指向当前分享链接 */
  qrDataUrl?: string | null;
}

/**
 * 分享卡片：固定 1080×1350，导出时按 1:1 栅格化。
 * 内容只用当前主题的颜色变量，夜空 / 纸面各自成立。
 */
export default function ShareCard({
  city,
  date,
  time,
  latitude,
  longitude,
  text,
  seed,
  scene,
  starCount,
  qrDataUrl,
}: ShareCardProps) {
  return (
    <article className="share-card">
      <header className="share-card__head">
        <span className="share-card__brand">天穹遗嘱</span>
        <span className="share-card__brand-en">SKY TESTAMENT</span>
      </header>

      <div className="share-card__place">{city}</div>
      <p className="share-card__when">
        {date.replace(/-/g, '.')} · {time}
      </p>
      <p className="share-card__coords">
        {latitude.toFixed(2)}°N {longitude.toFixed(2)}°E
      </p>

      <div className="share-card__chart">
        <Chart scene={scene} textFree />
      </div>

      <p className="share-card__text">{text}</p>

      {qrDataUrl && (
        <div className="share-card__qr">
          <img src={qrDataUrl} alt="扫码回到这一刻" />
          <span>扫码回到这一刻</span>
        </div>
      )}

      <footer className="share-card__foot">
        <span>seed {seed}</span>
        <span>{starCount} stars</span>
      </footer>
    </article>
  );
}
