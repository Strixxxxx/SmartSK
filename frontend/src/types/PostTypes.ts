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
    commentCount: number;
    author: string;
    postReference: string;
    publicAttachments: Attachment[];
    secureAttachments: Attachment[];
    taggedProjects?: TaggedProject[];
    viewOptions?: {
        opforPubEAttach: boolean;
    };
}

export interface Comment {
    commentID: number;
    parentCommentID: number | null;
    commentText: string;
    isAnonymous: boolean;
    alias: string | null;
    createdAt: string;
    fullName: string | null; 
    userID?: number; // Add userID to identify the author
    replies?: Comment[];
}
