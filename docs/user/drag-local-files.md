# Drag local files into a message

In the desktop app, drag files or folders from Finder or File Explorer onto the message composer.
Images are added as image attachments. Other files and folders are inserted as removable path chips
so the agent can read them from the local machine.

Local path chips are available when the thread runs in the desktop app's host environment. Threads
running in WSL, over SSH, or in another remote environment cannot read host paths; use that
environment's project file browser instead.
