# syntax=docker/dockerfile:1

#
#  Copyright (c) 2025 Fraunhofer-Gesellschaft zur Förderung der angewandten Forschung e.V.
#
#  This program and the accompanying materials are made available under the
#  terms of the Apache License, Version 2.0 which is available at
#  https://www.apache.org/licenses/LICENSE-2.0
#
#  SPDX-License-Identifier: Apache-2.0
#
#  Contributors:
#       Fraunhofer-Gesellschaft zur Förderung der angewandten Forschung e.V. - initial API and implementation
#

# Stage 1: Build the Angular application
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json .npmrc think-it-labs-edc-connector-client-0.10.0.tgz ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true npm ci

# Copy the full project and build it
COPY . .
RUN npm run build -- --configuration production


# Stage 2: Serve the app with Nginx
FROM nginxinc/nginx-unprivileged:stable-alpine

COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/jad-ui/browser /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
