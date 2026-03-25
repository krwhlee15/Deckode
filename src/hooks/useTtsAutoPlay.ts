import { useEffect, useRef, useState } from "react";

interface TtsAutoPlayOptions {
  /** Text to speak for the current step */
  text: string;
  /** Called when speech for current step finishes — advance to next step/slide */
  onStepDone: () => void;
  /** Whether auto-play is active */
  playing: boolean;
  /** Speech rate (0.5 – 2.0) */
  rate: number;
}

/**
 * Drives the Web Speech API for presenter auto-play.
 * Speaks `text` whenever it changes while `playing` is true.
 * Calls `onStepDone` when the utterance finishes so the caller can advance.
 */
export function useTtsAutoPlay({ text, onStepDone, playing, rate }: TtsAutoPlayOptions) {
  const onStepDoneRef = useRef(onStepDone);
  onStepDoneRef.current = onStepDone;
  const rateRef = useRef(rate);
  rateRef.current = rate;

  // Track what we're currently speaking to avoid re-triggering
  const currentTextRef = useRef("");

  useEffect(() => {
    if (!playing) {
      speechSynthesis.cancel();
      currentTextRef.current = "";
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      // No text for this step — auto-advance after a short pause
      const timer = setTimeout(() => onStepDoneRef.current(), 400);
      return () => clearTimeout(timer);
    }

    // Avoid re-speaking the same text (e.g. on re-render)
    if (trimmed === currentTextRef.current) return;
    currentTextRef.current = trimmed;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = rateRef.current;
    utterance.onend = () => {
      currentTextRef.current = "";
      onStepDoneRef.current();
    };
    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") return;
      console.warn("[TTS] error:", e.error);
      currentTextRef.current = "";
      onStepDoneRef.current();
    };
    speechSynthesis.speak(utterance);

    return () => {
      speechSynthesis.cancel();
    };
  }, [playing, text]);

  // Update rate on a live utterance (Chrome supports this)
  useEffect(() => {
    // Rate changes take effect on the next utterance
  }, [rate]);
}

/** Collect the text to speak for a given activeStep from note segments. */
export function getTextForStep(
  noteSegments: { text: string; step: number | null }[],
  activeStep: number,
): string {
  const parts: string[] = [];
  for (const seg of noteSegments) {
    if (seg.step === null) {
      // Always-visible text: only read on step 0
      if (activeStep === 0) parts.push(seg.text.trim());
    } else if (seg.step === activeStep) {
      parts.push(seg.text.trim());
    }
  }
  return parts.filter(Boolean).join(". ");
}

/** Get available voices for a dropdown */
export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const update = () => setVoices(speechSynthesis.getVoices());
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);

  return voices;
}
