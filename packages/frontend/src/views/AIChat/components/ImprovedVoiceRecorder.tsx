// Beautiful Voice Recorder with Modern UI Design

import React, { useState, useRef, useEffect } from 'react';
import { 
  StopIcon, 
  PlayIcon, 
  PauseIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

interface ImprovedVoiceRecorderProps {
  onSendVoiceMessage: (audioBlob: Blob | null, duration: number) => void;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'preview';

const ImprovedVoiceRecorder: React.FC<ImprovedVoiceRecorderProps> = ({
  onSendVoiceMessage,
  disabled: _disabled = false
}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(40).fill(0));
  const [previewWaveform, setPreviewWaveform] = useState<number[]>(Array(15).fill(6));
  const [_hasPermission, setHasPermission] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewWaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isInitializingRef = useRef<boolean>(false);

  // Check microphone permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setHasPermission(result.state === 'granted');
        } else {
          setHasPermission(null);
        }
      } catch (error) {
        console.warn('Could not check microphone permissions:', error);
        setHasPermission(null);
      }
    };

    checkPermissions();
  }, []);

  // Format time (MM:SS)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Start recording
  const startRecording = async () => {
    // Prevent multiple recordings
    if (timerRef.current || isInitializingRef.current) {
      console.log('⚠️ Recording already in progress, skipping...');
      return;
    }
    
    isInitializingRef.current = true;
    
    try {
      console.log('🎤 Starting recording...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      streamRef.current = stream;
      setHasPermission(true);

      // Check for supported MIME types
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/wav')) {
          mimeType = 'audio/wav';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = 'audio/ogg';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (chunks.length === 0) {
          console.warn('⚠️ No audio data recorded');
          setRecordingState('idle');
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        setAudioBlob(blob);
        
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        setRecordingState('preview');
        console.log('✅ Recording completed, blob size:', blob.size);
      };

      mediaRecorder.onerror = (event) => {
        console.error('❌ Recording error:', event);
        stopRecording();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      
      setRecordingState('recording');
      setRecordingTime(0);

      // Start timer
      let startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsed);
        
        if (elapsed >= 300) {
          stopRecording();
        }
      }, 1000);

      // Animate waveform with more natural patterns
      waveTimerRef.current = setInterval(() => {
        setWaveformBars(prev => 
          prev.map((_, i) => {
            const baseHeight = Math.sin(i * 0.3 + Date.now() * 0.005) * 15 + 20;
            const noise = Math.random() * 25;
            return Math.max(5, Math.min(50, baseHeight + noise));
          })
        );
      }, 100);

      console.log('✅ Recording started');
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      setHasPermission(false);
      setRecordingState('idle');
      isInitializingRef.current = false;
      
      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
            alert('Microphone access denied. Please allow microphone access and try again.');
            break;
          case 'NotFoundError':
            alert('No microphone found. Please check your audio devices.');
            break;
          case 'NotReadableError':
            alert('Microphone is being used by another application.');
            break;
          default:
            alert('Could not access microphone. Please try again.');
        }
      } else {
        alert('Could not start recording. Please try again.');
      }
      isInitializingRef.current = false;
    }
  };

  // Stop recording
  const stopRecording = () => {
    console.log('⏹️ Stopping recording...');
    console.log('🕒 Current timerRef.current:', timerRef.current);
    console.log('🕒 Current recordingTime before clearing:', recordingTime);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      console.log('✅ Timer cleared');
    } else {
      console.log('❌ No timer to clear');
    }
    
    if (waveTimerRef.current) {
      clearInterval(waveTimerRef.current);
      waveTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setWaveformBars(Array(40).fill(0));
  };

  // Cancel recording
  const cancelRecording = () => {
    console.log('❌ Canceling recording...');
    stopRecording();
    setRecordingTime(0);
    setAudioBlob(null);
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    
    onSendVoiceMessage(null, 0);
  };

  // Play/pause preview
  const togglePreviewPlayback = () => {
    if (!audioUrl) return;

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      
      // Stop waveform animation
      if (previewWaveTimerRef.current) {
        clearInterval(previewWaveTimerRef.current);
        previewWaveTimerRef.current = null;
      }
      
      // Reset to static waveform
      setPreviewWaveform(Array(15).fill(6));
    } else {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      } else {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => {
          setIsPlaying(false);
          // Stop animation when audio ends
          if (previewWaveTimerRef.current) {
            clearInterval(previewWaveTimerRef.current);
            previewWaveTimerRef.current = null;
          }
          setPreviewWaveform(Array(15).fill(6));
        };
      }
      
      audioRef.current.play();
      setIsPlaying(true);
      
      // Start waveform animation
      previewWaveTimerRef.current = setInterval(() => {
        setPreviewWaveform(prev => 
          prev.map((_, i) => {
            const baseHeight = Math.sin(i * 0.4 + Date.now() * 0.003) * 6 + 8;
            const noise = Math.random() * 4;
            return Math.max(4, Math.min(16, baseHeight + noise));
          })
        );
      }, 100);
    }
  };

  // Send voice message
  const sendVoiceMessage = () => {
    if (audioBlob) {
      if (recordingTime < 1) {
        alert('Recording too short. Please record for at least 1 second.');
        return;
      }

      onSendVoiceMessage(audioBlob, recordingTime);
      
      // Cleanup
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      
      setRecordingState('idle');
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
      setIsPlaying(false);
    }
  };

  // Handle ESC key to close recorder
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelRecording();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-start recording when component mounts
  useEffect(() => {
    let mounted = true;
    
    const initRecording = async () => {
      if (recordingState === 'idle' && !timerRef.current && mounted) {
        await startRecording();
      }
    };
    
    initRecording();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveTimerRef.current) clearInterval(waveTimerRef.current);
      if (previewWaveTimerRef.current) clearInterval(previewWaveTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [audioUrl]);

  // Don't render anything if idle
  if (recordingState === 'idle') {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 no-drag p-4"
        onClick={(e) => e.target === e.currentTarget && cancelRecording()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 400 }}
          className="bg-white rounded-2xl shadow-xl w-80 max-w-sm overflow-hidden"
        >
          {recordingState === 'recording' ? (
            // Recording UI - Minimalistic
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-3 h-3 bg-GreatifyGreen-500 rounded-full"
                  />
                  <span className="text-sm font-medium text-GreatifyNeutral-700">Recording</span>
                </div>
                <button
                  onClick={cancelRecording}
                  className="w-6 h-6 rounded-full bg-GreatifyNeutral-100 hover:bg-GreatifyNeutral-200 flex items-center justify-center transition-colors"
                >
                  <XMarkIcon className="h-4 w-4 text-GreatifyNeutral-600" />
                </button>
              </div>
              
              {/* Time */}
              <div className="text-center mb-4">
                <div className="text-2xl font-mono font-bold text-GreatifyNeutral-800">
                  {formatTime(recordingTime)}
                </div>
              </div>

              {/* Mini Waveform */}
              <div className="flex items-end justify-center h-12 gap-0.5 mb-4">
                {waveformBars.slice(0, 20).map((height, index) => (
                  <motion.div
                    key={index}
                    className="bg-GreatifyGreen-500 rounded-full w-1"
                    animate={{ height: `${Math.max(2, height * 0.3)}px` }}
                    transition={{ duration: 0.1 }}
                  />
                ))}
              </div>

              {/* Stop Button */}
              <div className="flex justify-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={stopRecording}
                  className="w-12 h-12 bg-GreatifyGreen-500 hover:bg-GreatifyGreen-600 rounded-full flex items-center justify-center text-white transition-colors shadow-lg"
                >
                  <StopIcon className="h-5 w-5" />
                </motion.button>
              </div>
            </div>
          ) : (
            // Preview UI - Minimalistic
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <PlayIcon className="h-4 w-4 text-GreatifyPurple-500" />
                  <span className="text-sm font-medium text-GreatifyNeutral-700">Preview</span>
                </div>
                <button
                  onClick={cancelRecording}
                  className="w-6 h-6 rounded-full bg-GreatifyNeutral-100 hover:bg-GreatifyNeutral-200 flex items-center justify-center transition-colors"
                >
                  <XMarkIcon className="h-4 w-4 text-GreatifyNeutral-600" />
                </button>
              </div>

              {/* Preview Content */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-GreatifyNeutral-50 rounded-xl">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={togglePreviewPlayback}
                  className="w-10 h-10 bg-GreatifyPurple-500 hover:bg-GreatifyPurple-600 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  {isPlaying ? (
                    <PauseIcon className="h-4 w-4" />
                  ) : (
                    <PlayIcon className="h-4 w-4 ml-0.5" />
                  )}
                </motion.button>
                
                <div className="flex-1">
                  <div className="text-xs text-GreatifyNeutral-600 mb-1">
                    {formatTime(recordingTime)}
                  </div>
                  {/* Mini waveform for preview */}
                  <div className="flex items-center gap-0.5 h-4">
                    {previewWaveform.map((height, i) => (
                      <div
                        key={i}
                        className="bg-GreatifyPurple-300 rounded-full w-0.5"
                        style={{
                          height: `${height}px`
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={cancelRecording}
                  className="flex-1 bg-GreatifyNeutral-100 hover:bg-GreatifyNeutral-200 text-GreatifyNeutral-700 py-3 px-4 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={sendVoiceMessage}
                  className="flex-1 bg-GreatifyGreen-500 hover:bg-GreatifyGreen-600 text-white py-3 px-4 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  Send
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ImprovedVoiceRecorder;