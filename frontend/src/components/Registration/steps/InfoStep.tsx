import React, { useState, useEffect } from 'react';
import { TextField, MenuItem, Box, Typography } from '@mui/material';
import axiosInstance from '../../../backend connection/axiosConfig';
import './InfoStep.css';

interface InfoStepProps {
  formData: any;
  setFormData: (data: any) => void;
  attachment: File | null;
  setAttachment: (file: File | null) => void;
  attachmentBack: File | null;
  setAttachmentBack: (file: File | null) => void;
  errors: any;
  setErrors: (errors: any) => void;
}

const InfoStep: React.FC<InfoStepProps> = ({ formData, setFormData, attachment, setAttachment, attachmentBack, setAttachmentBack, errors, setErrors }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBack, setPreviewBack] = useState<string | null>(null);

  const handleFileChange = (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      setAttachment(file);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFileChange(e.dataTransfer.files);
  };

  useEffect(() => {
    if (!attachment) {
      setPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(attachment);
    setPreview(objectUrl);

    // Free memory when the component is unmounted
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment]);

  const handleFileChangeBack = (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      setAttachmentBack(file);
    }
  };

  const onDropBack = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFileChangeBack(e.dataTransfer.files);
  };

  useEffect(() => {
    if (!attachmentBack) {
      setPreviewBack(null);
      return;
    }
    const objectUrl = URL.createObjectURL(attachmentBack);
    setPreviewBack(objectUrl);

    // Free memory when the component is unmounted
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachmentBack]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const validateField = async (field: string, value: string) => {
    if (!value) return; // Don't validate empty fields on blur

    try {
      const response = await axiosInstance.post('/api/register/validate-field', { field, value });
      if (response.data.exists) {
        setErrors((prev: any) => ({ ...prev, [field]: `This ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is already taken.` }));
      } else {
        setErrors((prev: any) => ({ ...prev, [field]: '' }));
      }
    } catch (error) {
      console.error(`Could not validate ${field}`, error);
      // Optionally set an error to inform the user that validation failed
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Your Information</Typography>
      <TextField
        label="Full Name"
        name="fullName"
        value={formData.fullName}
        onChange={handleChange}
        error={!!errors.fullName}
        helperText={errors.fullName}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Barangay"
        name="barangay"
        value={formData.barangay}
        onChange={handleChange}
        error={!!errors.barangay}
        helperText={errors.barangay}
        fullWidth
        margin="normal"
        required
        select
      >
        <MenuItem value="San Bartolome">San Bartolome</MenuItem>
        <MenuItem value="Nagkaisang Nayon">Nagkaisang Nayon</MenuItem>
      </TextField>
      <TextField
        label="Email Address"
        name="emailAddress"
        type="email"
        value={formData.emailAddress}
        onChange={handleChange}
        onBlur={(e) => validateField('emailAddress', e.target.value)}
        error={!!errors.emailAddress}
        helperText={errors.emailAddress}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Phone Number (11 digits)"
        name="phoneNumber"
        type="tel"
        value={formData.phoneNumber}
        onChange={handleChange}
        onBlur={(e) => validateField('phoneNumber', e.target.value)}
        error={!!errors.phoneNumber}
        helperText={errors.phoneNumber}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Date of Birth"
        name="dateOfBirth"
        type="date"
        value={formData.dateOfBirth}
        onChange={handleChange}
        error={!!errors.dateOfBirth}
        helperText={errors.dateOfBirth}
        fullWidth
        margin="normal"
        required
        InputLabelProps={{ shrink: true }}
      />
      <Box mt={2}>
        <Typography variant="subtitle1" gutterBottom>ID Attachment (Recommended to use QCID for much faster approval)</Typography>
        <div 
          className="dropzone"
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input 
            id="file-input"
            type="file" 
            hidden 
            onChange={(e) => handleFileChange(e.target.files)} 
            accept="image/jpeg,image/png,application/pdf"
          />
          {preview ? (
            <img src={preview} alt="ID Preview" className="preview-image" />
          ) : (
            <p>Drag & drop your ID here, or click to select a file.</p>
          )}
        </div>
        {errors.attachment && <Typography variant="caption" color="error">{errors.attachment}</Typography>}
      </Box>
      <Box mt={2}>
        <Typography variant="subtitle1" gutterBottom>Back of ID</Typography>
        <div
          className="dropzone"
          onDragOver={onDragOver}
          onDrop={onDropBack}
          onClick={() => document.getElementById('file-input-back')?.click()}
        >
          <input
            id="file-input-back"
            type="file"
            hidden
            onChange={(e) => handleFileChangeBack(e.target.files)}
            accept="image/jpeg,image/png,application/pdf"
          />
          {previewBack ? (
            <img src={previewBack} alt="Back of ID Preview" className="preview-image" />
          ) : (
            <p>Drag & drop the back of your ID here, or click to select a file.</p>
          )}
        </div>
        {errors.attachmentBack && <Typography variant="caption" color="error">{errors.attachmentBack}</Typography>}
      </Box>
    </Box>
  );
};

export default InfoStep;