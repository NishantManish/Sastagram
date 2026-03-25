/**
 * Extracts the public_id from a Cloudinary URL.
 * Cloudinary URLs are in the format:
 * https://res.cloudinary.com/<cloud_name>/<resource_type>/upload/v<version>/<public_id>.<extension>
 */
export function getPublicIdFromUrl(url: string): { publicId: string, resourceType: string } | null {
  if (!url || !url.includes('cloudinary.com')) return null;

  try {
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return null;

    const resourceType = parts[uploadIndex - 1]; // e.g., 'image' or 'video'
    
    // The public_id starts after the version (v<numbers>) or immediately after 'upload'
    let publicIdWithExtension = parts.slice(uploadIndex + 1).join('/');
    
    // Remove transformations if present (e.g., f_auto,q_auto,w_500/)
    // Our app always generates transformations starting with 'f_auto,q_auto'
    const subParts = publicIdWithExtension.split('/');
    if (subParts.length > 1 && subParts[0].startsWith('f_auto,q_auto')) {
      // It's likely a transformation string, remove it
      subParts.shift();
      publicIdWithExtension = subParts.join('/');
    }
    
    // Remove version if present (e.g., v123456789/)
    if (publicIdWithExtension.startsWith('v')) {
      const versionMatch = publicIdWithExtension.match(/^v\d+\//);
      if (versionMatch) {
        publicIdWithExtension = publicIdWithExtension.replace(versionMatch[0], '');
      }
    }

    // Remove file extension
    const lastDotIndex = publicIdWithExtension.lastIndexOf('.');
    const publicId = lastDotIndex !== -1 
      ? publicIdWithExtension.substring(0, lastDotIndex) 
      : publicIdWithExtension;

    return { publicId, resourceType };
  } catch (error) {
    console.error('Error parsing Cloudinary URL:', error);
    return null;
  }
}

/**
 * Placeholder for Cloudinary deletion.
 * Secure deletion requires a server-side signature.
 * Since this is a pure client-side app, we cannot securely delete from the frontend.
 */
export async function deleteFromCloudinary(url: string | null | undefined): Promise<boolean> {
  console.warn('Cloudinary deletion skipped: Secure deletion requires a server-side signature which is not available in this pure client-side architecture.');
  return false;
}
