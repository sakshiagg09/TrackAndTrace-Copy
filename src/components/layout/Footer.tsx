import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-white text-gray-500 text-sm text-center py-3 border-t border-gray-200">
      © {new Date().getFullYear()} NAV IT Consulting | All Rights Reserved
    </footer>
  );
};

export default Footer;