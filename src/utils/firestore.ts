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

export function getFriendlyMessage(error: any): string {
  const message = error instanceof Error ? error.message : String(error);
  
  if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
    return "You don't have permission to perform this action. Please check if you're logged in and have the necessary rights.";
  }
  if (message.includes('not-found')) {
    return "The requested information could not be found. It may have been deleted.";
  }
  if (message.includes('already-exists')) {
    return "This already exists. Please try a different name or value.";
  }
  if (message.includes('resource-exhausted')) {
    return "The server is currently busy. Please try again in a moment.";
  }
  if (message.includes('failed-precondition')) {
    return "The operation couldn't be completed in the current state. Please refresh and try again.";
  }
  if (message.includes('unavailable')) {
    return "The service is temporarily unavailable. Please check your internet connection.";
  }
  if (message.includes('deadline-exceeded')) {
    return "The operation took too long to complete. Please try again.";
  }
  if (message.includes('unauthenticated')) {
    return "Please log in to continue.";
  }
  
  return "An unexpected error occurred. Please try again later.";
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const friendlyMessage = getFriendlyMessage(error);

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
