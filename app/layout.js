import { Public_Sans } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const publicSans = Public_Sans({ 
  subsets: ['latin'],
  variable: '--font-public-sans',
});

export const metadata = {
  title: 'Excel Mapping',
  description: 'Map fields between Excel files',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={publicSans.variable}>
      <body className="min-h-screen flex flex-col bg-gray-100">
        <Toaster position="top-right" />
        {children}
      </body>
    </html>
  );
}
