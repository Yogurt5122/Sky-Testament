import { useEffect, useRef, useState } from 'react';
import { parseDateInput } from '../core/date-input';

interface DateFieldProps {
  /** 规范化后的日期 YYYY-MM-DD */
  value: string;
  onChange: (value: string) => void;
}

/**
 * 日期输入：可以直接敲年月日，也可以用右侧按钮调出系统日期选择器。
 * 输入不完整或日期不存在时不会写入，失焦后还原成上一个有效值。
 */
export function DateField({ value, onChange }: DateFieldProps) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  // 外部改动（前后一日、夜间时间轴、分享链接）时同步文本框
  useEffect(() => {
    setText(value);
    setInvalid(false);
  }, [value]);

  function handleChange(raw: string): void {
    setText(raw);
    const parsed = parseDateInput(raw);
    if (parsed) {
      setInvalid(false);
      if (parsed !== value) onChange(parsed);
      return;
    }
    setInvalid(raw.trim().length > 0);
  }

  function handleBlur(): void {
    const parsed = parseDateInput(text);
    if (parsed) {
      setText(parsed);
      setInvalid(false);
      if (parsed !== value) onChange(parsed);
      return;
    }
    // 输入不完整或不存在，还原成上一个有效日期
    setText(value);
    setInvalid(false);
  }

  function openPicker(): void {
    const input = pickerRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // 某些浏览器在非直接点击时不允许，退回到 focus
      }
    }
    input.focus();
  }

  return (
    <div className={`date-field${invalid ? ' is-invalid' : ''}`}>
      <input
        type="text"
        value={text}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="1998-05-12"
        aria-invalid={invalid || undefined}
        title="格式：1998-05-12、1998/5/12 或 1998年5月12日"
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
      />
      <button
        type="button"
        className="date-field__picker"
        aria-label="打开日期选择器"
        title="打开日期选择器"
        onClick={openPicker}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <rect x="2" y="3.5" width="12" height="10" fill="none" stroke="currentColor" />
          <line x1="2" y1="6.5" x2="14" y2="6.5" stroke="currentColor" />
          <line x1="5.5" y1="2" x2="5.5" y2="4.5" stroke="currentColor" />
          <line x1="10.5" y1="2" x2="10.5" y2="4.5" stroke="currentColor" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        className="date-field__native"
        type="date"
        value={value}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => event.target.value && onChange(event.target.value)}
      />
    </div>
  );
}
