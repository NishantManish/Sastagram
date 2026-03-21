/**
 * Cloudinary Image Optimization Utility
 * 
 * This utility uses Cloudinary's "Fetch" API to optimize remote images (like those from Firebase Storage).
 * It automatically applies:
 * - f_auto: Best format for the browser (WebP, AVIF, etc.)
 * - q_auto: Optimal compression without visible quality loss
 */

export const getOptimizedImageUrl = (url: string, width?: number, height?: number) => {
  const cloudName = (import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME;
  
  // If no cloud name is provided or URL is invalid/local, return original
  if (!cloudName || !url || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }

  // Cloudinary Fetch API: https://cloudinary.com/documentation/fetch_remote_images
  const baseUrl = `https://res.cloudinary.com/${cloudName}/image/fetch/`;
  
  const transformations = [
    'f_auto',
    'q_auto',
    width ? `w_${width}` : '',
    height ? `h_${height}` : '',
    (width || height) ? 'c_fill' : '',
  ].filter(Boolean).join(',');

  return `${baseUrl}${transformations}/${encodeURIComponent(url)}`;
};
