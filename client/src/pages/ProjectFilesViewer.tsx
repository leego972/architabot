import React, { useState, useEffect } from 'react';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

const ProjectFilesViewer: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>('my_projects');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`Failed to fetch files: ${res.statusText}`);
      const data: FileEntry[] = await res.json();
      setFiles(data);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(currentPath);
  }, []);

  const onFolderClick = (folderName: string) => {
    const newPath = currentPath + '/' + folderName;
    fetchFiles(newPath);
  };

  const onBackClick = () => {
    if (currentPath === 'my_projects') return;
    const parts = currentPath.split('/');
    parts.pop();
    const newPath = parts.join('/') || 'my_projects';
    fetchFiles(newPath);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Project Files Viewer</h1>
      <div className="mb-2">
        <button
          onClick={onBackClick}
          disabled={currentPath === 'my_projects'}
          className={`px-3 py-1 rounded ${currentPath === 'my_projects' ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          Back
        </button>
        <span className="ml-4 font-mono">/{currentPath}</span>
      </div>
      {loading && <p>Loading files...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
      {!loading && !error && (
        <ul className="list-disc list-inside">
          {files.map((file) => (
            <li key={file.path}>
              {file.isDirectory ? (
                <button
                  onClick={() => onFolderClick(file.name)}
                  className="text-blue-600 underline"
                >
                  📁 {file.name}
                </button>
              ) : (
                <span>📄 {file.name}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProjectFilesViewer;
