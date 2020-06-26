/*!
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { FirebaseServiceInterface, FirebaseServiceInternalsInterface } from '../firebase-service';
import { FirebaseApp } from '../firebase-app';
import * as validator from '../utils/validator';
import { FirebaseRemoteConfigError } from './remote-config-utils';
import {
  RemoteConfigApiClient,
  RemoteConfigTemplate,
  RemoteConfigParameter,
  RemoteConfigCondition,
  RemoteConfigParameterGroup,
  ListVersionsOptions,
  ListVersionsResult,
  RemoteConfigUser,
  Version,
} from './remote-config-api-client';

/**
 * Internals of an RemoteConfig service instance.
 */
class RemoteConfigInternals implements FirebaseServiceInternalsInterface {
  /**
   * Deletes the service and its associated resources.
   *
   * @return {Promise<()>} An empty Promise that will be fulfilled when the service is deleted.
   */
  public delete(): Promise<void> {
    // There are no resources to clean up
    return Promise.resolve(undefined);
  }
}

/**
 * Remote Config service bound to the provided app.
 */
export class RemoteConfig implements FirebaseServiceInterface {
  public readonly INTERNAL: RemoteConfigInternals = new RemoteConfigInternals();

  private readonly client: RemoteConfigApiClient;

  /**
   * @param {FirebaseApp} app The app for this RemoteConfig service.
   * @constructor
   */
  constructor(readonly app: FirebaseApp) {
    this.client = new RemoteConfigApiClient(app);
  }

  /**
  * Gets the current active version of the Remote Config template of the project.
  *
  * @return {Promise<RemoteConfigTemplate>} A Promise that fulfills when the template is available.
  */
  public getTemplate(): Promise<RemoteConfigTemplate> {
    return this.client.getTemplate()
      .then((templateResponse) => {
        return new RemoteConfigTemplateImpl(templateResponse);
      });
  }

  /**
  * Gets the requested version of the Remote Config template of the project.
  *
  * @param {number | string} versionNumber Version number of the Remote Config template to look up.
  * 
  * @return {Promise<RemoteConfigTemplate>} A Promise that fulfills when the template is available.
  */
  public getTemplateAtVersion(versionNumber: number | string): Promise<RemoteConfigTemplate> {
    return this.client.getTemplateAtVersion(versionNumber)
      .then((templateResponse) => {
        return new RemoteConfigTemplateImpl(templateResponse);
      });
  }

  /**
   * Validates a Remote Config template.
   *
   * @param {RemoteConfigTemplate} template The Remote Config template to be validated.
   *
   * @return {Promise<RemoteConfigTemplate>} A Promise that fulfills when a template is validated.
   */
  public validateTemplate(template: RemoteConfigTemplate): Promise<RemoteConfigTemplate> {
    return this.client.validateTemplate(template)
      .then((templateResponse) => {
        return new RemoteConfigTemplateImpl(templateResponse);
      });
  }

  /**
   * Publishes a Remote Config template.
   *
   * @param {RemoteConfigTemplate} template The Remote Config template to be validated.
   * @param {any=} options Optional options object when publishing a Remote Config template.
   *
   * @return {Promise<RemoteConfigTemplate>} A Promise that fulfills when a template is published.
   */
  public publishTemplate(template: RemoteConfigTemplate, options?: { force: boolean }): Promise<RemoteConfigTemplate> {
    return this.client.publishTemplate(template, options)
      .then((templateResponse) => {
        return new RemoteConfigTemplateImpl(templateResponse);
      });
  }

  /**
   * Rollbacks a project's published Remote Config template to the specified version.
   * A rollback is equivalent to getting a previously published Remote Config
   * template, and re-publishing it using a force update.
   *
   * @param {number | string} versionNumber The version number of the Remote Config template
   *    to rollback to.
   * @return {Promise<RemoteConfigTemplate>} A Promise that fulfills with the published template.
   */
  public rollback(versionNumber: number | string): Promise<RemoteConfigTemplate> {
    return this.client.rollback(versionNumber)
      .then((templateResponse) => {
        return new RemoteConfigTemplateImpl(templateResponse);
      });
  }

  /**
  * Gets a list of Remote Config template versions that have been published, sorted in reverse 
  * chronological order. Only the last 300 versions are stored.
  * All versions that correspond to non-active Remote Config templates (i.e., all except the 
  * template that is being fetched by clients) are also deleted if they are older than 90 days.
  * 
  * @param {ListVersionsOptions} options Optional options object for getting a list of versions.
  * @return A promise that fulfills with a `ListVersionsResult`.
  */
  public listVersions(options?: ListVersionsOptions): Promise<ListVersionsResult> {
    return this.client.listVersions(options)
      .then((listVersionsResponse) => {
        return {
          versions: listVersionsResponse.versions?.map(version => new VersionImpl(version)) ?? [],
          nextPageToken: listVersionsResponse.nextPageToken,
        }
      });
  }

  /**
   * Creates and returns a new Remote Config template from a JSON string.
   *
   * @param {string} json The JSON string to populate a Remote Config template.
   *
   * @return {RemoteConfigTemplate} A new template instance.
   */
  public createTemplateFromJSON(json: string): RemoteConfigTemplate {
    if (!validator.isNonEmptyString(json)) {
      throw new FirebaseRemoteConfigError(
        'invalid-argument',
        'JSON string must be a valid non-empty string');
    }

    let template: RemoteConfigTemplate;
    try {
      template = JSON.parse(json);
    } catch (e) {
      throw new FirebaseRemoteConfigError(
        'invalid-argument',
        `Failed to parse the JSON string: ${json}. ` + e
      );
    }

    return new RemoteConfigTemplateImpl(template);
  }
}

/**
 * Remote Config template internal implementation.
 */
class RemoteConfigTemplateImpl implements RemoteConfigTemplate {

  public parameters: { [key: string]: RemoteConfigParameter };
  public parameterGroups: { [key: string]: RemoteConfigParameterGroup };
  public conditions: RemoteConfigCondition[];
  private readonly etagInternal: string;
  public version?: Version;

  constructor(config: RemoteConfigTemplate) {
    if (!validator.isNonNullObject(config) ||
      !validator.isNonEmptyString(config.etag)) {
      throw new FirebaseRemoteConfigError(
        'invalid-argument',
        `Invalid Remote Config template: ${JSON.stringify(config)}`);
    }

    this.etagInternal = config.etag;

    if (typeof config.parameters !== 'undefined') {
      if (!validator.isNonNullObject(config.parameters)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Remote Config parameters must be a non-null object');
      }
      this.parameters = config.parameters;
    } else {
      this.parameters = {};
    }

    if (typeof config.parameterGroups !== 'undefined') {
      if (!validator.isNonNullObject(config.parameterGroups)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Remote Config parameter groups must be a non-null object');
      }
      this.parameterGroups = config.parameterGroups;
    } else {
      this.parameterGroups = {};
    }

    if (typeof config.conditions !== 'undefined') {
      if (!validator.isArray(config.conditions)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Remote Config conditions must be an array');
      }
      this.conditions = config.conditions;
    } else {
      this.conditions = [];
    }

    if (typeof config.version !== 'undefined') {
      this.version = new VersionImpl(config.version);
    }
  }

  /**
   * Gets the ETag of the template.
   *
   * @return {string} The ETag of the Remote Config template.
   */
  get etag(): string {
    return this.etagInternal;
  }

  /**
   * @return {RemoteConfigTemplate} A JSON-serializable representation of this object.
   */
  public toJSON(): RemoteConfigTemplate {
    return {
      conditions: this.conditions,
      parameters: this.parameters,
      parameterGroups: this.parameterGroups,
      etag: this.etag,
      version: this.version,
    }
  }
}

/**
* Remote Config Version internal implementation.
*/
class VersionImpl implements Version {
  public readonly versionNumber?: string; // int64 format
  public readonly updateTime?: string; // in UTC
  public readonly updateOrigin?: ('REMOTE_CONFIG_UPDATE_ORIGIN_UNSPECIFIED' | 'CONSOLE' |
    'REST_API' | 'ADMIN_SDK_NODE');
  public readonly updateType?: ('REMOTE_CONFIG_UPDATE_TYPE_UNSPECIFIED' |
    'INCREMENTAL_UPDATE' | 'FORCED_UPDATE' | 'ROLLBACK');
  public readonly updateUser?: RemoteConfigUser;
  public readonly description?: string;
  public readonly rollbackSource?: string;
  public readonly isLegacy?: boolean;

  constructor(version: Version) {
    if (!validator.isNonNullObject(version)) {
      throw new FirebaseRemoteConfigError(
        'invalid-argument',
        `Invalid Remote Config version instance: ${JSON.stringify(version)}`);
    }

    if (typeof version.versionNumber !== 'undefined') {
      if (!validator.isNonEmptyString(version.versionNumber) &&
        !validator.isNumber(version.versionNumber)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version number must be a non-empty string in int64 format or a number');
      }
      if (!Number.isInteger(Number(version.versionNumber))) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version number must be an integer or a string in int64 format');
      }
      this.versionNumber = version.versionNumber;
    }

    if (typeof version.updateOrigin !== 'undefined') {
      if (!validator.isNonEmptyString(version.updateOrigin)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version update origin must be a non-empty string');
      }
      this.updateOrigin = version.updateOrigin;
    }

    if (typeof version.updateType !== 'undefined') {
      if (!validator.isNonEmptyString(version.updateType)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version update type must be a non-empty string');
      }
      this.updateType = version.updateType;
    }

    if (typeof version.updateUser !== 'undefined') {
      if (!validator.isNonNullObject(version.updateUser)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version update user must be a non-null object');
      }
      this.updateUser = version.updateUser;
    }

    if (typeof version.description !== 'undefined') {
      if (!validator.isNonEmptyString(version.description)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version description must be a non-empty string');
      }
      this.description = version.description;
    }

    if (typeof version.rollbackSource !== 'undefined') {
      if (!validator.isNonEmptyString(version.rollbackSource)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version rollback source must be a non-empty string');
      }
      this.rollbackSource = version.rollbackSource;
    }

    if (typeof version.isLegacy !== 'undefined') {
      if (!validator.isBoolean(version.isLegacy)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version.isLegacy must be a boolean');
      }
      this.isLegacy = version.isLegacy;
    }

    // The backend API provides timestamps as ISO date strings. The Admin SDK exposes timestamps
    // as UTC date strings. If a developer uses a previously obtained template with UTC timestamps
    // we could still validate it below.
    if (typeof version.updateTime !== 'undefined') {
      if (!validator.isISODateString(version.updateTime) &&
        !validator.isUTCDateString(version.updateTime)) {
        throw new FirebaseRemoteConfigError(
          'invalid-argument',
          'Version update time must be a valid date string');
      }
      if (validator.isISODateString(version.updateTime)) {
        // timestamps in output `Version` obtained from the API should be in UTC.
        this.updateTime = new Date(version.updateTime).toUTCString();
      }
    }
  }

  /**
   * @return {Version} A JSON-serializable representation of this object.
   */
  public toJSON(): Version {
    return {
      versionNumber: this.versionNumber,
      updateOrigin: this.updateOrigin,
      updateType: this.updateType,
      updateUser: this.updateUser,
      description: this.description,
      rollbackSource: this.rollbackSource,
      isLegacy: this.isLegacy,
      updateTime: this.updateTime,
    }
  }
}
