import React from "react";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import SettingsIcon from "@mui/icons-material/Settings";
import Tooltip from "@mui/material/Tooltip";
import { IconButton } from "@mui/material";
import Logo from "../../assets/Logo - Copy.svg";

const Navbar: React.FC = () => {
  return (
    <header className="flex justify-between items-center h-16 bg-white border-b border-gray-200 shadow-sm px-6">
      {/* Left Section: Logo + Title */}
      <div className="flex items-center gap-3">
        <img src={Logo} alt="Logo" className="h-6" />
        <h1 className="text-lg font-semibold text-gray-800">
          Track Shipments
        </h1>
      </div>

      {/* Right Section: Icons + Avatar */}
      <div className="flex items-center gap-2">
        <Tooltip title="Help">
          <IconButton>
            <HelpOutlineIcon className="text-gray-600 hover:text-blue-600" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Settings">
          <IconButton>
            <SettingsIcon className="text-gray-600 hover:text-blue-600" />
          </IconButton>
        </Tooltip>

      </div>
    </header>
  );
};

export default Navbar;