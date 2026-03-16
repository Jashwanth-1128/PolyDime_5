import { db, auth } from './firebase';
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, query, onSnapshot } from 'firebase/firestore';
import localforage from 'localforage';

// Configure localforage
localforage.config({
  name: 'Flipverse',
  storeName: 'books_data'
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
// ... (rest of the interfaces)
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface BookmarkPin {
  id: string;
  page: number;
  x: number;
  y: number;
  color: string;
}

export interface Highlight {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
}

export interface StickyNote {
  id: string;
  page: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  currentPage: number;
  totalPages: number;
  lastOpened: number;
  fileData?: string; // base64
  coverUrl?: string;
  status?: 'reading' | 'read';
  pins?: BookmarkPin[];
  highlights?: Highlight[];
  stickyNotes?: StickyNote[];
}

export const getBook = async (id: string): Promise<Book | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const path = `users/${user.uid}/books/${id}`;
  try {
    const docRef = doc(db, 'users', user.uid, 'books', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const book = { id: docSnap.id, ...docSnap.data() } as Book;
      
      // Try to load fileData from local storage if it's not in Firestore
      if (!book.fileData) {
        const localData = await localforage.getItem<string>(`file_${id}`);
        if (localData) {
          book.fileData = localData;
        }
      }
      
      return book;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
};

export const saveBook = async (book: Book): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  const path = `users/${user.uid}/books/${book.id}`;
  
  try {
    // If there's fileData, save it locally and remove it from the object being sent to Firestore
    if (book.fileData) {
      await localforage.setItem(`file_${book.id}`, book.fileData);
      const { fileData, ...metadata } = book;
      const docRef = doc(db, 'users', user.uid, 'books', book.id);
      await setDoc(docRef, metadata, { merge: true });
    } else {
      const docRef = doc(db, 'users', user.uid, 'books', book.id);
      await setDoc(docRef, book, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const updateBookProgress = async (id: string, currentPage: number, lastOpened: number): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  const path = `users/${user.uid}/books/${id}`;
  try {
    const docRef = doc(db, 'users', user.uid, 'books', id);
    await updateDoc(docRef, { currentPage, lastOpened });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const deleteBook = async (id: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  const path = `users/${user.uid}/books/${id}`;
  try {
    const docRef = doc(db, 'users', user.uid, 'books', id);
    await deleteDoc(docRef);
    // Also delete local data
    await localforage.removeItem(`file_${id}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const subscribeToBooks = (callback: (books: Book[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  const path = `users/${user.uid}/books`;
  const q = query(collection(db, 'users', user.uid, 'books'));
  return onSnapshot(q, (snapshot) => {
    const books: Book[] = [];
    snapshot.forEach((doc) => {
      books.push({ id: doc.id, ...doc.data() } as Book);
    });
    callback(books);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

