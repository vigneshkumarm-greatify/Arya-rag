/**
 * Username Input Component
 * 
 * Simple username input with localStorage persistence.
 * Shows current username and allows editing.
 * 
 * @author ARYA RAG Team
 */

import React, { useState } from 'react';
import { User, Edit2, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useUsername } from '@/contexts/UsernameContext';

export const UsernameInput: React.FC = () => {
  const { username, setUsername, isUsernameSet } = useUsername();
  const [isEditing, setIsEditing] = useState(!isUsernameSet);
  const [tempUsername, setTempUsername] = useState(username);
  const [error, setError] = useState('');

  // Handle save
  const handleSave = () => {
    const trimmed = tempUsername.trim();
    
    if (!trimmed) {
      setError('Username is required');
      return;
    }

    if (trimmed.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (trimmed.length > 50) {
      setError('Username must be less than 50 characters');
      return;
    }

    // Only allow alphanumeric, dash, underscore
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError('Username can only contain letters, numbers, dash, and underscore');
      return;
    }

    setError('');
    setUsername(trimmed);
    setIsEditing(false);
  };

  // Handle cancel
  const handleCancel = () => {
    setTempUsername(username);
    setError('');
    setIsEditing(false);
  };

  // Handle enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <User className="w-5 h-5 text-muted-foreground" />
          
          {isEditing ? (
            <div className="flex-1 space-y-2">
              <div className="flex items-center space-x-2">
                <Input
                  value={tempUsername}
                  onChange={(e) => {
                    setTempUsername(e.target.value);
                    setError('');
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter username"
                  className="flex-1"
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSave}
                  className="h-8 w-8"
                >
                  <Check className="h-4 w-4" />
                </Button>
                {isUsernameSet && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleCancel}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Username</Label>
                <p className="font-medium">{username}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setIsEditing(true);
                  setTempUsername(username);
                }}
                className="h-8 w-8"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};