import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function getFriendlyMessage(error: any, operationType?: OperationType, path?: string | null): string {
  const message = error instanceof Error ? error.message : String(error);
  const context = `[${operationType || 'unknown'}] at ${path || 'unknown'}`;
  
  if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
    return `Permission Denied: ${context}. You do not have the required Firestore security rule permissions for this operation.`;
  }
  if (message.includes('not-found')) {
    return `Resource Not Found: ${context}. The document at the specified path does not exist.`;
  }
  if (message.includes('already-exists')) {
    return `Conflict: ${context}. A document already exists at this path.`;
  }
  if (message.includes('resource-exhausted')) {
    return `Quota Exceeded: ${context}. Firestore quota or rate limits have been reached.`;
  }
  if (message.includes('failed-precondition')) {
    return `Precondition Failed: ${context}. This often means a required index is missing or the document state is invalid for this operation.`;
  }
  if (message.includes('unavailable')) {
    return `Service Unavailable: ${context}. The Firestore service is currently unreachable. Check your network connection.`;
  }
  if (message.includes('deadline-exceeded')) {
    return `Timeout: ${context}. The operation took too long and was aborted.`;
  }
  if (message.includes('unauthenticated')) {
    return `Unauthenticated: ${context}. You must be logged in to perform this action.`;
  }
  
  // Auth specific errors
  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password') || message.includes('auth/user-not-found')) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (message.includes('auth/email-already-in-use')) {
    return 'This email address is already registered. Try logging in instead.';
  }
  if (message.includes('auth/weak-password')) {
    return 'The password provided is too weak. It must be at least 6 characters long.';
  }
  if (message.includes('auth/popup-closed-by-user')) {
    return 'The sign-in popup was closed before completion. Please try again.';
  }
  if (message.includes('auth/requires-recent-login')) {
    return 'This action requires a recent login. Please log out and log back in to continue.';
  }
  
  return `Error: ${message} (${context})`;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const friendlyMessage = getFriendlyMessage(error, operationType, path);

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  console.error(`Firestore Error [${operationType}] at ${path || 'unknown'}:`, {
    ...errInfo,
    friendlyMessage
  });

  // Throw a JSON string as per the spec, but we can also include the friendly message in it
  throw new Error(JSON.stringify({
    ...errInfo,
    friendlyMessage
  }));
}

export function parseFirestoreError(error: any): string {
  if (!error) return 'An unknown error occurred.';
  const message = error instanceof Error ? error.message : String(error);
  
  try {
    const parsed = JSON.parse(message);
    if (parsed.friendlyMessage) {
      return parsed.friendlyMessage;
    }
  } catch (e) {
    // Not a JSON error
  }
  
  return message;
}
