import React from 'react';
import './ViewOption.css';

interface ViewOptions {
    opforPubProj: boolean;
    opforAllBrgyProj: boolean;
    opforBrgyProj: boolean;
    opforPubEAttach: boolean;
    opforAllBrgyEAttach: boolean;
    opforBrgyEAttach: boolean;
}

interface ViewOptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    options: ViewOptions;
    onSave: (newOptions: ViewOptions) => void;
}

const ViewOptionModal: React.FC<ViewOptionModalProps> = ({ isOpen, onClose, options, onSave }) => {
    const [localOptions, setLocalOptions] = React.useState(options);

    const handleProjectViewChange = (value: string) => {
        setLocalOptions(prev => ({
            ...prev,
            opforPubProj: value === 'public',
            opforAllBrgyProj: value === 'all_brgy',
            opforBrgyProj: value === 'brgy_only',
        }));
    };

    const handleAttachmentViewChange = (value: string) => {
        setLocalOptions(prev => ({
            ...prev,
            opforPubEAttach: value === 'public',
            opforAllBrgyEAttach: value === 'all_brgy',
            opforBrgyEAttach: value === 'brgy_only',
        }));
    };

    const handleSave = () => {
        onSave(localOptions);
        onClose();
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="view-option-modal-overlay" onClick={onClose}>
            <div className="view-option-modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Visibility Options</h2>
                <div className="form-group">
                    <label>Project Visibility</label>
                    <p className="input-description">Control who can see the projects you tag in this post.</p>
                    <div className="radio-group">
                        <div className="radio-option">
                            <input type="radio" id="proj_public" name="proj_vis" value="public" checked={localOptions.opforPubProj} onChange={() => handleProjectViewChange('public')} />
                            <label htmlFor="proj_public">Public</label>
                        </div>
                        <div className="radio-option">
                            <input type="radio" id="proj_all_brgy" name="proj_vis" value="all_brgy" checked={localOptions.opforAllBrgyProj} onChange={() => handleProjectViewChange('all_brgy')} />
                            <label htmlFor="proj_all_brgy">All Barangays</label>
                        </div>
                        <div className="radio-option">
                            <input type="radio" id="proj_brgy_only" name="proj_vis" value="brgy_only" checked={localOptions.opforBrgyProj} onChange={() => handleProjectViewChange('brgy_only')} />
                            <label htmlFor="proj_brgy_only">Barangay Only</label>
                        </div>
                    </div>
                </div>
                <div className="form-group">
                    <label>Secure Attachment Visibility</label>
                    <p className="input-description">Control who can see the sensitive documents you upload.</p>
                    <div className="radio-group">
                        <div className="radio-option">
                            <input type="radio" id="attach_public" name="attach_vis" value="public" checked={localOptions.opforPubEAttach} onChange={() => handleAttachmentViewChange('public')} />
                            <label htmlFor="attach_public">Public</label>
                        </div>
                        <div className="radio-option">
                            <input type="radio" id="attach_all_brgy" name="attach_vis" value="all_brgy" checked={localOptions.opforAllBrgyEAttach} onChange={() => handleAttachmentViewChange('all_brgy')} />
                            <label htmlFor="attach_all_brgy">All Barangays</label>
                        </div>
                        <div className="radio-option">
                            <input type="radio" id="attach_brgy_only" name="attach_vis" value="brgy_only" checked={localOptions.opforBrgyEAttach} onChange={() => handleAttachmentViewChange('brgy_only')} />
                            <label htmlFor="attach_brgy_only">Barangay Only</label>
                        </div>
                    </div>
                </div>
                <div className="form-actions">
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="button" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default ViewOptionModal;