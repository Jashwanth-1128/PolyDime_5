/// <reference types="vite/client" />

interface Window {
  recaptchaVerifier: any;
}

declare module '*?url' {
  const content: string;
  export default content;
}
