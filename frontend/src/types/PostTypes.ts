export interface Attachment {
    attachmentID: number;
    fileType: string;
    filePath: string;
}

export interface TaggedProject {
    projectID: number;
    title: string;
}

export interface Post {
    postID: number;
    userID: number;
    title: string;
    description: string;
    author: string;
    postReference: string;
    publicAttachments: Attachment[];
    secureAttachments: Attachment[];
    taggedProjects?: TaggedProject[];
    viewOptions?: {
        opforPubEAttach: boolean;
    };
}
