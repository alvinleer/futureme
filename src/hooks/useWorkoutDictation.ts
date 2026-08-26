// useWorkoutDictation — shared record → transcribe → parse pipeline for the
// workout screens. Keeps permission handling, the auto-stop timer and the
// "released before the recorder was ready" race in one place instead of copied
// across the plan editor and the session logger.

import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import { WORKOUT_TRANSCRIPTION_PROMPT, transcribeAudio } from "../api/transcribe-audio";
import { SpokenExercise, parseSpokenExercises } from "../api/workout-speech-parser";

/** Recordings stop themselves after this long so a forgotten tap cannot run forever. */
const MAX_RECORDING_MS = 30000;

export type DictationStage = "idle" | "recording" | "transcribing" | "parsing";

interface Options {
  /** Called with the parsed exercises once a recording is understood. */
  onResult: (exercises: SpokenExercise[], transcript: string) => void;
}

export function useWorkoutDictation({ onResult }: Options) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // onResult is captured in a ref so stopRecording never closes over a stale
  // version of the caller's state setters.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [stage, setStage] = useState<DictationStage>("idle");
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
    if (!rec) return;
    recordingRef.current = null;

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = rec.getURI();
      if (!uri) throw new Error("The recording could not be saved.");

      setStage("transcribing");
      const transcript = await transcribeAudio(uri, WORKOUT_TRANSCRIPTION_PROMPT);

      setStage("parsing");
      const exercises = await parseSpokenExercises(transcript);

      setStage("idle");
      onResultRef.current(exercises, transcript);
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
        setError("Microphone access is off. Enable it in Settings to dictate your workout.");
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
    isBusy: stage === "transcribing" || stage === "parsing",
    error,
    clearError: () => setError(null),
    toggle,
  };
}
