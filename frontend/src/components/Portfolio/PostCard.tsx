import React from 'react';
import './PostCard.css';

interface Attachment {
    attachmentID: number;
    fileType: string;
    filePath: string;
}

interface Post {
    postID: number;
    title: string;
    description: string;
    author: string;
    attachments: Attachment[];
}

interface PostCardProps {
    post: Post;
}

const PostCard: React.FC<PostCardProps> = ({ post }) => {
    return (
        <div className="post-card">
            <h3>{post.title}</h3>
            <p className="author">By: {post.author}</p>
            <p>{post.description}</p>
            <div className="attachments">
                {post.attachments.map(attachment => (
                    <div key={attachment.attachmentID} className="attachment">
                        {attachment.fileType.startsWith('image') ? (
                            <img src={attachment.filePath} alt={post.title} />
                        ) : (
                            <video src={attachment.filePath} controls />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PostCard;