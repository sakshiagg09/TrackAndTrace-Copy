import React, { useState } from "react";
import {Dialog,DialogTitle,DialogContent,DialogActions,Button,Typography,CircularProgress,} from "@mui/material";
 
interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  flowUrl: string; // Power Automate HTTP endpoint
}
 
const UploadDialog: React.FC<UploadDialogProps> = ({ open, onClose, flowUrl }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
 
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      setMessage("❌ Please upload only PDF files.");
      return;
    }
    setFile(selected);
    setMessage(null);
  };
 
  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a file first.");
      return;
    }
 
    setLoading(true);
    setMessage(null);
 
    try {
      const base64 = await toBase64(file);
 
      const response = await fetch(flowUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileContent: base64.split(",")[1], // remove prefix
        }),
      });
 
      if (!response.ok) throw new Error("Upload failed");
 
      setMessage("✅ File successfully sent to Power Automate Flow!");
      setFile(null);
    } catch (err: any) {
      setMessage("❌ " + (err.message || "Upload failed"));
    } finally {
      setLoading(false);
    }
  };
 
  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
 
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>📎 Upload PDF</DialogTitle>
      <DialogContent>
        <input type="file" accept="application/pdf" onChange={handleFileChange} />
        {file && <Typography sx={{ mt: 2 }}>Selected: {file.name}</Typography>}
        {loading && <CircularProgress size={24} sx={{ mt: 2 }} />}
        {message && (
          <Typography sx={{ mt: 2 }} color="primary">
            {message}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          disabled={!file || loading}
          onClick={handleUpload}
        >
          Send to Flow
        </Button>
      </DialogActions>
    </Dialog>
  );
};
 
export default UploadDialog;