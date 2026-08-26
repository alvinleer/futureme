// useDiaryDictation — record → transcribe pipeline for freeform diary entries.
// Mirrors useWorkoutDictation's permission/auto-stop/race handling but skips
// structured parsing since a diary entry is just stored as spoken text.

import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import { DIARY_TRANSCRIPTION_PROMPT, transcribeAudio } from "../api/transcribe-audio";

/** Recordings stop themselves after this long so a forgotten tap cannot run forever. */
const MAX_RECORDING_MS = 120000;

export type DiaryDictationStage = "idle" | "recording" | "transcribing";

interface Options {
  /** Called with the transcript and how long the recording ran once transcribed. */
  onResult: (transcript: string, durationSec: number) => void;
}

export function useDiaryDictation({ onResult }: Options) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [stage, setStage] = useState<DiaryDictationStage>("idle");
  const [error, setError] = useState<string | null>(null);

  const clearAutoStop = () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const stopRecording = useCallback(async () => {
    clearAutoStop();
    if (readyRef.current) {
      try {
        await readyRef.current;
      } catch {
        /* recorder never came up — nothing to stop */
      }
      readyRef.current = null;
    }

    const rec = recordingRef.current;
    const startedAt = startedAtRef.current;
    if (!rec) return;
    recordingRef.current = null;
    startedAtRef.current = null;

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = rec.getURI();
      if (!uri) throw new Error("The recording could not be saved.");

      const durationSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;

      setStage("transcribing");
      const transcript = await transcribeAudio(uri, DIARY_TRANSCRIPTION_PROMPT);

      setStage("idle");
      onResultRef.current(transcript, durationSec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setStage("idle");
      setError(
        msg.startsWith("No speech detected")
          ? "No speech was picked up. Speak clearly and try again."
          : msg
      );
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Microphone access is off. Enable it in Settings to record a diary entry.");
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      let resolveReady: () => void;
      readyRef.current = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      startedAtRef.current = Date.now();
      setStage("recording");
      resolveReady!();

      autoStopRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_MS);
    } catch {
      readyRef.current = null;
      setStage("idle");
      setError("Could not start recording. Close any other app using the mic and try again.");
    }
  }, [stopRecording]);

  const toggle = useCallback(() => {
    if (stage === "recording") return stopRecording();
    if (stage === "idle") return startRecording();
    return Promise.resolve();
  }, [stage, startRecording, stopRecording]);

  // Leaving the screen mid-recording should not leave the mic hot.
  useEffect(() => {
    return () => {
      clearAutoStop();
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (rec) {
        rec.stopAndUnloadAsync().catch(() => undefined);
        Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined);
      }
    };
  }, []);

  return {
    stage,
    isRecording: stage === "recording",
    isBusy: stage === "transcribing",
    error,
    clearError: () => setError(null),
    toggle,
  };
}
