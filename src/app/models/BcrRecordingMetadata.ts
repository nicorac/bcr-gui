export type CallDirection = 'in' | 'out' | 'conference' | '';

/**
 * Describes a single call recording, as returned by BCR
*/
export interface BcrRecordingMetadata {

  // Raw timestamp as the number of milliseconds since the Unix epoch
  timestamp_unix_ms: number,

  // Timestamp in RFC3339/ISO8601-compatible format
  timestamp: string,

  // Call direction: in, out, or conference. (null if unknown or Android <10)
  direction: CallDirection,

  // SIM slot (null if Android <11 or phone permission is denied)
  // Numbering starts from 1, not 0
  sim_slot: number,

  // Display name of the call, as shown in the dialer's call log
  // (This may include the business' name for dialers that perform reverse lookups, like Google Dialer)
  call_log_name: string,

  // (Contains multiple items if it's a conference call)
  calls: [
    {
      // Raw phone number as reported by Android (null for private calls)
      // For outgoing calls, this is usually what the user typed.
      // For incoming calls, this is usually E.164 formatted.
      phone_number: string,

      // Phone number in the country-specific format
      // (null for private calls, unknown country, or if Android can't parse the phone number)
      phone_number_formatted: string,

      // Contact name (null if contact does not exist or contacts permission is denied)
      contact_name: string,

      // Caller name (Caller ID) (null if unavailable)
      caller_name: string,
    }
  ],

  output: {
    format: {
      // The audio encoding format (eg: "WAV\/PCM")
      type: string,
      // The MIME type of the container format (eg. OGG)
      mime_type_container: string,
      // The MIME type of the raw audio stream (eg. Opus)
      mime_type_audio: string,      // "audio\/x-wav"
      // The type of the parameter value below. Either "bitrate", "compression_level", or "none".
      parameter_type: string
      // The encoder quality/size parameter
      parameter: number,
    },
    recording: {
      // The total number of audio frames that BCR read from the audio
      // device. This includes the periods of time when the recording was
      // paused or on hold.
      // (Number of frames == number of samples * channel count)
      frames_total: number,
      // The number of audio frames that were actually saved to the output
      // file. This excludes the periods of time when the recording was
      // paused or on hold.
      // (Number of frames == number of samples * channel count)
      frames_encoded: number,
      // The number of samples per second of audio.
      sample_rate: number,
      // The number of channels in the audio. This is currently always 1
      // because no device supports stereo call audio.
      channel_count: number,
      // The total time in seconds that BCR read from the audio device.
      // (Equal to: frames_total / sample_rate / channel_count)
      duration_secs_total: number,
      // The time in seconds of audio actually saved to the output file.
      // (Equal to: frames_encoded / sample_rate / channel_count)
      duration_secs_encoded: number,
      // The size of the recording buffer in frames. This is the maximum
      // number of audio frames read from the audio driver before it is
      // passed to the audio encoder.
      buffer_frames: number,
      // The number of buffer overruns. This is the number of times that
      // the CPU or storage couldn't keep up while encoding the raw audio,
      // resulting in skips (loss of audio).
      buffer_overruns: number,
      // Whether the call was ever paused by the user.
      was_ever_paused: number,
      // Whether the call was ever placed on hold (call waiting).
      was_ever_holding: number,
    }
  }

}
