import { supabase } from './supabase';

/**
 * Compresses an image file or data URL into a lightweight Base64 JPEG data URL
 * (max dimensions 320x320, quality 0.82) to avoid network payload limits & lag.
 */
export async function compressImage(
  input: File | string,
  maxWidth = 320,
  maxHeight = 320,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof input === 'string' ? input : '');
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onerror = (err) => reject(err);

    if (typeof input === 'string') {
      img.src = input;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(input);
    }
  });
}

/**
 * Gets student photo from Supabase or local storage fallback
 */
export function getStudentPhoto(studentId?: string, dbPhotoUrl?: string): string | undefined {
  if (dbPhotoUrl && dbPhotoUrl.trim().length > 0) {
    return dbPhotoUrl;
  }
  if (!studentId) return undefined;
  try {
    const local = localStorage.getItem(`sfms_photo_${studentId}`);
    if (local && local.trim().length > 0) {
      return local;
    }
  } catch (e) {
    // ignore storage errors
  }
  return undefined;
}

/**
 * Saves student photo to both local storage (guaranteed instant) and Supabase
 */
export async function saveStudentPhoto(
  studentId: string,
  photoInput: File | string
): Promise<{ success: boolean; photoUrl: string; error?: string; isLocalFallback?: boolean }> {
  try {
    const compressedUrl = await compressImage(photoInput);

    // 1. Save to local storage for immediate persistence
    try {
      localStorage.setItem(`sfms_photo_${studentId}`, compressedUrl);
    } catch (e) {
      console.warn('LocalStorage save warning:', e);
    }

    // 2. Broadcast change event across components
    window.dispatchEvent(new CustomEvent('sfms_photo_updated', { detail: { studentId, photoUrl: compressedUrl } }));

    // 3. Attempt to save to Supabase
    let isLocalFallback = false;
    let errorMessage: string | undefined;

    try {
      const { error } = await supabase
        .from('students')
        .update({ photo_url: compressedUrl })
        .eq('id', studentId);

      if (error) {
        console.warn('Supabase photo update notice:', error.message);
        if (error.code === 'PGRST204' || error.message.includes('column') || error.message.includes('Failed to fetch')) {
          isLocalFallback = true;
        } else {
          errorMessage = error.message;
        }
      }
    } catch (dbErr: any) {
      console.warn('Supabase photo network notice:', dbErr);
      isLocalFallback = true;
    }

    return {
      success: true,
      photoUrl: compressedUrl,
      error: errorMessage,
      isLocalFallback,
    };
  } catch (err: any) {
    console.error('Error processing photo:', err);
    return {
      success: false,
      photoUrl: '',
      error: err.message || 'Failed to process image file.',
    };
  }
}

/**
 * Deletes student photo from local storage and Supabase
 */
export async function deleteStudentPhoto(studentId: string): Promise<void> {
  try {
    localStorage.removeItem(`sfms_photo_${studentId}`);
    window.dispatchEvent(new CustomEvent('sfms_photo_updated', { detail: { studentId, photoUrl: null } }));
    
    await supabase
      .from('students')
      .update({ photo_url: null })
      .eq('id', studentId);
  } catch (e) {
    console.warn('Error deleting photo:', e);
  }
}
