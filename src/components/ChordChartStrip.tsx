import { useEffect, useRef } from "react";
import { chordAtIndex, type ChordSegment } from "../lib/chordChart";

interface Props {
  chart: ChordSegment[];
  /** 방금 연주한 음표 인덱스 */
  currentIndex: number | null;
}

/** 미리 계산된 코드 진행을 가로로 늘어놓고, 지금 울리는 코드를 따라간다. */
export function ChordChartStrip({ chart, currentIndex }: Props) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const active = currentIndex === null ? null : chordAtIndex(chart, currentIndex);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active?.startIndex]);

  return (
    <div className="chord-chart">
      <div className="chord-chart__now">
        {active ? (
          <span className="chord-chart__now-label">{active.label}</span>
        ) : (
          <span className="chord-chart__now-idle">코드 {chart.length}개</span>
        )}
      </div>
      <div className="chord-chart__strip">
        {chart.map((seg, i) => {
          const isActive = active !== null && seg.startIndex === active.startIndex;
          const passed = currentIndex !== null && seg.endIndex <= currentIndex;
          return (
            <span
              key={`${seg.startIndex}-${i}`}
              ref={isActive ? activeRef : undefined}
              className={`chord-chart__chip${isActive ? " active" : ""}${passed ? " passed" : ""}`}
            >
              {seg.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
