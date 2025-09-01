// 2. Alert Sound System
export class AlertSoundManager {
    private audioContext: AudioContext | null = null;
    private sounds: Map<string, AudioBuffer> = new Map();
    
    constructor() {
      this.initAudioContext();
    }
  
    private initAudioContext() {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('Audio context not supported:', error);
      }
    }
  
    // Generate alert sounds programmatically
    private generateAlertSound(frequency: number, duration: number): AudioBuffer | null {
      if (!this.audioContext) return null;
  
      const sampleRate = this.audioContext.sampleRate;
      const length = sampleRate * duration;
      const buffer = this.audioContext.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
  
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        // Create a beeping sound with fade out
        const fadeOut = Math.max(0, 1 - (t / duration));
        data[i] = Math.sin(2 * Math.PI * frequency * t) * fadeOut * 0.3;
      }
  
      return buffer;
    }
  
    public initSounds() {
      if (!this.audioContext) return;
  
      // Warning sound - higher pitch, shorter
      const warningSound = this.generateAlertSound(800, 0.3);
      if (warningSound) this.sounds.set('warning', warningSound);
  
      // Critical sound - lower pitch, longer, more urgent
      const criticalSound = this.generateAlertSound(400, 0.6);
      if (criticalSound) this.sounds.set('critical', criticalSound);
    }
  
    public playAlert(type: 'warning' | 'critical') {
      if (!this.audioContext || !this.sounds.has(type)) return;
  
      try {
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = this.sounds.get(type)!;
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Set volume
        gainNode.gain.value = 0.1;
        
        source.start();
      } catch (error) {
        console.warn('Failed to play alert sound:', error);
      }
    }
  }