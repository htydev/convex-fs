---
title: 1. Introduction
description: The basics of ConvexFS
---

ConvexFS provides a way to upload, manage, and serve files in Convex projects.
It offers an path-based listing of files inside a namespace together, similar to
services like S3. It provides APIs that allow you system to copy, move, or
delete files within your file system.

The ConvexFS component uses Convex tables to store basic information about your
file paths and the **blobs** they refer to. Blobs are byte arrays of file
data—your file's contents—as well as some basic metadata, like the original mime
type of the content and the total byte count.

The component stores these blob bodies are using [bunny.net](https://bunny.net)'s
Edge Storage service. Later, when your app loads the file bodies, it uses
Bunny CDN–the global content delivery network that's tightly integrated
with Bunny Storage.

The CDN URLs are authorized by your application and leverage Bunny
CDN's
[token authentication](https://docs.bunny.net/docs/cdn-token-authentication) in
order to provide secure, specific access to any file.

Here's the general layout of how Convex and bunny.net share responsibilities:

![ConvexFS Diagram](./convexfs-diagram.png)
