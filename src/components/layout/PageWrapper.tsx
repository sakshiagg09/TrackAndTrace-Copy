import React from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";
import type { ReactNode } from "react";

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

const PageWrapper: React.FC<PageWrapperProps> = ({ children, className }) => {
  return (
    <div className={`flex flex-col min-h-screen bg-gray-50 ${className || ""}`}>
      <Navbar />
      <main className="flex-1 px-6 py-6">{children}</main>
      <Footer />
    </div>
  );
};

export default PageWrapper;