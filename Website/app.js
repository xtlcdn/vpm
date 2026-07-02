import { baseLayerLuminance, StandardLuminance, accentBaseColor, SwatchRGB } from 'https://unpkg.com/@fluentui/web-components@2.6.1';
import { createUnityPackage, downloadUnityPackage } from './vpai_creator.js';

const INDEX_JSON_PATH = './index.json';

let LISTING_URL = '';
const PACKAGES = {};

const setTheme = () => {
  baseLayerLuminance.setValueFor(document.documentElement, window.matchMedia('(prefers-color-scheme: dark)').matches ?
    StandardLuminance.DarkMode :
    StandardLuminance.LightMode
  );
  accentBaseColor.setValueFor(document.documentElement, SwatchRGB.create(0.83, 0.47, 0));
};

const asObject = value => (typeof value === 'object' && value !== null ? value : {});
const getField = (value, ...keys) => {
  const obj = asObject(value);
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
};

const resolveUrl = (url, baseUrl) => {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).toString();
  } catch (error) {
    console.error(`Failed to resolve URL "${url}" against "${baseUrl}".`, error);
    return null;
  }
};

const getAuthorData = author => {
  if (typeof author === 'string') {
    return { name: author, email: '', url: '' };
  }
  const normalized = asObject(author);
  return {
    name: normalized.name ?? 'Unknown',
    email: normalized.email ?? '',
    url: normalized.url ?? '',
  };
};

const normalizeInfoLink = infoLink => {
  if (!infoLink) return { url: '', text: '' };
  if (typeof infoLink === 'string') return { url: infoLink, text: 'Learn More' };
  const normalized = asObject(infoLink);
  return {
    url: normalized.url ?? '',
    text: normalized.text ?? 'Learn More',
  };
};

const sanitizeFileName = value => value.replace(/[\[\]\/\\?%*:|"<>]/g, '_');

const getVersionComparator = semverLibrary => (a, b) => {
  const aValid = semverLibrary.valid(a);
  const bValid = semverLibrary.valid(b);

  if (aValid && bValid) return semverLibrary.rcompare(a, b);
  if (aValid) return -1;
  if (bValid) return 1;
  return b.localeCompare(a, undefined, { numeric: true });
};

const getDefaultVersion = (versionList, semverLibrary) => {
  const stableVersions = versionList
    .filter(version => semverLibrary.valid(version) && !semverLibrary.prerelease(version))
    .sort(getVersionComparator(semverLibrary));
  if (stableVersions.length > 0) return stableVersions[0];

  const validVersions = versionList
    .filter(version => semverLibrary.valid(version))
    .sort(getVersionComparator(semverLibrary));
  if (validVersions.length > 0) return validVersions[0];

  return [...versionList].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? null;
};

const buildPackageIndex = (packages, semverLibrary, listingJsonUrl) => {
  const packageIndex = {};
  for (const [packageId, packageData] of Object.entries(asObject(packages))) {
    const versions = asObject(packageData.versions);
    const versionList = Object.keys(versions);
    if (versionList.length === 0) continue;

    const sortedVersions = [...versionList].sort(getVersionComparator(semverLibrary));
    const latestStableVersion = getDefaultVersion(versionList, semverLibrary) ?? sortedVersions[0];
    const selectedVersion = latestStableVersion;

    packageIndex[packageId] = {
      id: packageId,
      versions: Object.fromEntries(
        Object.entries(versions).map(([version, value]) => {
          const versionInfo = asObject(value);
          return [version, {
            ...versionInfo,
            author: getAuthorData(versionInfo.author),
            url: resolveUrl(versionInfo.url, listingJsonUrl),
            displayName: versionInfo.displayName ?? packageId,
            description: versionInfo.description ?? '',
            keywords: Array.isArray(versionInfo.keywords) ? versionInfo.keywords : [],
            dependencies: asObject(versionInfo.vpmDependencies),
            version,
            packageId,
          }];
        }),
      ),
      sortedVersions,
      latestStableVersion,
      selectedVersion,
    };
  }
  return packageIndex;
};

(() => {
  setTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setTheme);

  const semverLibrary = window.semver;
  if (!semverLibrary) {
    throw new Error('Semver library was not loaded from unpkg.');
  }

  const packageGrid = document.getElementById('packageGrid');
  const packageRowTemplate = document.getElementById('packageRowTemplate');
  const searchInput = document.getElementById('searchInput');
  const urlBarHelpButton = document.getElementById('urlBarHelp');
  const addListingToVccHelp = document.getElementById('addListingToVccHelp');
  const addListingToVccHelpClose = document.getElementById('addListingToVccHelpClose');
  const vccListingInfoUrlField = document.getElementById('vccListingInfoUrlField');
  const vccListingInfoUrlFieldCopy = document.getElementById('vccListingInfoUrlFieldCopy');
  const vccAddRepoButton = document.getElementById('vccAddRepoButton');
  const vccUrlField = document.getElementById('vccUrlField');
  const vccUrlFieldCopy = document.getElementById('vccUrlFieldCopy');
  const packageInfoVccUrlField = document.getElementById('packageInfoVccUrlField');
  const listingBanner = document.getElementById('listingBanner');
  const listingName = document.getElementById('listingName');
  const listingDescription = document.getElementById('listingDescription');
  const listingAuthorEmail = document.getElementById('listingAuthorEmail');
  const publishedByTooltip = document.getElementById('publishedByTooltip');
  const listingAuthorLink = document.getElementById('listingAuthorLink');
  const listingInfoLinkTop = document.getElementById('listingInfoLinkTop');
  const listingInfoLinkBottom = document.getElementById('listingInfoLinkBottom');
  const listingInfoLinkTopAnchor = document.getElementById('listingInfoLinkTopAnchor');
  const listingInfoLinkBottomAnchor = document.getElementById('listingInfoLinkBottomAnchor');

  const rowMoreMenu = document.getElementById('rowMoreMenu');
  const rowMoreMenuDownload = document.getElementById('rowMoreMenuDownload');
  const rowMoreMenuDownloadInstaller = document.getElementById('rowMoreMenuDownloadInstaller');
  let activeMenuPackageId = null;

  const packageInfoModal = document.getElementById('packageInfoModal');
  const packageInfoModalClose = document.getElementById('packageInfoModalClose');
  const packageInfoName = document.getElementById('packageInfoName');
  const packageInfoId = document.getElementById('packageInfoId');
  const packageInfoVersionSelect = document.getElementById('packageInfoVersionSelect');
  const packageInfoDescription = document.getElementById('packageInfoDescription');
  const packageInfoAuthor = document.getElementById('packageInfoAuthor');
  const packageInfoAuthorText = document.getElementById('packageInfoAuthorText');
  const packageInfoDependencies = document.getElementById('packageInfoDependencies');
  const packageInfoKeywords = document.getElementById('packageInfoKeywords');
  const packageInfoLicense = document.getElementById('packageInfoLicense');
  const packageInfoLicenseText = document.getElementById('packageInfoLicenseText');
  const packageInfoDownloadZip = document.getElementById('packageInfoDownloadZip');
  const packageInfoDownloadInstaller = document.getElementById('packageInfoDownloadInstaller');
  const packageInfoDownloadInstallerLabel = document.getElementById('packageInfoDownloadInstallerLabel');
  const packageInfoVccUrlFieldCopy = document.getElementById('packageInfoVccUrlFieldCopy');

  let activeInfoPackageId = null;
  const packageTypeCache = {};

  const getSelectedVersionInfo = packageId => {
    const packageInfo = PACKAGES[packageId];
    if (!packageInfo) return null;
    const selectedVersion = packageInfo.selectedVersion;
    return packageInfo.versions[selectedVersion] ?? null;
  };

  const getLatestStableVersionInfo = packageId => {
    const packageInfo = PACKAGES[packageId];
    if (!packageInfo) return null;
    const latestStableVersion = packageInfo.latestStableVersion;
    return packageInfo.versions[latestStableVersion] ?? null;
  };

  const getPackageType = (packageId, visited = new Set()) => {
    if (packageTypeCache[packageId]) return packageTypeCache[packageId];
    if (visited.has(packageId)) return 'Any';
    visited.add(packageId);

    const versionInfo = getLatestStableVersionInfo(packageId);
    if (!versionInfo) return 'Any';
    const dependencyIds = Object.keys(asObject(versionInfo.dependencies));
    let hasAvatarDependency = false;
    if (dependencyIds.includes('com.vrchat.worlds')) {
      packageTypeCache[packageId] = 'World';
      return 'World';
    }
    if (dependencyIds.includes('com.vrchat.avatars')) {
      hasAvatarDependency = true;
    }
    for (const dependencyId of dependencyIds) {
      if (!PACKAGES[dependencyId]) continue;
      const dependencyType = getPackageType(dependencyId, new Set(visited));
      if (dependencyType === 'World') {
        packageTypeCache[packageId] = 'World';
        return 'World';
      }
      if (dependencyType === 'Avatar') {
        hasAvatarDependency = true;
      }
    }

    const resolvedType = hasAvatarDependency ? 'Avatar' : 'Any';
    packageTypeCache[packageId] = resolvedType;
    return resolvedType;
  };

  const downloadZipForVersion = versionInfo => {
    if (!versionInfo?.url) return false;
    const { pathname } = new URL(versionInfo.url);
    const lastDotIndex = pathname.lastIndexOf('.');
    const extension = lastDotIndex >= 0 ? pathname.substring(lastDotIndex) : '.zip';
    const fileName = sanitizeFileName(`${versionInfo.displayName}-${versionInfo.version}${extension}`);
    const anchor = document.createElement('a');
    anchor.href = versionInfo.url;
    anchor.download = fileName;
    anchor.click();
    return true;
  };

  const downloadInstallerForVersion = async versionInfo => {
    const installerContent = await createUnityPackage({
      vpmRepositories: [LISTING_URL],
      vpmDependencies: { [versionInfo.packageId]: versionInfo.version },
    });
    const installerFileName = sanitizeFileName(`${versionInfo.displayName}-${versionInfo.version}-installer.unitypackage`);
    downloadUnityPackage(installerContent, installerFileName);
  };

  const updateListingUrlFields = url => {
    LISTING_URL = url;
    vccUrlField.value = url;
    vccListingInfoUrlField.value = url;
    packageInfoVccUrlField.value = url;
  };

  const renderPackageKeywords = (keywords = []) => {
    if (keywords.length === 0) {
      packageInfoKeywords.parentElement.classList.add('hidden');
      return;
    }

    packageInfoKeywords.parentElement.classList.remove('hidden');
    packageInfoKeywords.innerHTML = '';
    for (const keyword of keywords) {
      const keywordDiv = document.createElement('div');
      keywordDiv.classList.add('me-2', 'mb-2', 'badge');
      keywordDiv.textContent = keyword;
      packageInfoKeywords.appendChild(keywordDiv);
    }
  };

  const renderPackageLicense = (license, licensesUrl) => {
    if (!license && !licensesUrl) {
      packageInfoLicense.parentElement.classList.add('hidden');
      return;
    }

    packageInfoLicense.parentElement.classList.remove('hidden');
    const text = license ?? 'See License';
    if (licensesUrl) {
      packageInfoLicense.classList.remove('hidden');
      packageInfoLicenseText.classList.add('hidden');
      packageInfoLicense.textContent = text;
      packageInfoLicense.href = licensesUrl;
    } else {
      packageInfoLicense.classList.add('hidden');
      packageInfoLicenseText.classList.remove('hidden');
      packageInfoLicenseText.textContent = text;
    }
  };

  const renderPackageDependencies = dependencies => {
    packageInfoDependencies.innerHTML = '';
    for (const [name, version] of Object.entries(asObject(dependencies))) {
      const depRow = document.createElement('li');
      depRow.classList.add('mb-2');
      const dependencyLink = document.createElement('a');
      const isInternalPackage = Boolean(PACKAGES[name]);
      dependencyLink.textContent = name;
      if (isInternalPackage) {
        dependencyLink.href = '###';
        dependencyLink.addEventListener('click', event => {
          event.preventDefault();
          openPackageInfo(name);
        });
      } else {
        dependencyLink.href = `https://vpm-catalog.vercel.app/packages/${encodeURIComponent(name)}`;
        dependencyLink.target = '_blank';
        dependencyLink.rel = 'noopener noreferrer';
      }

      depRow.appendChild(dependencyLink);
      depRow.appendChild(document.createTextNode(` @ v${version}`));
      packageInfoDependencies.appendChild(depRow);
    }
  };

  const modalControl = packageInfoModal.shadowRoot?.querySelector('.control');
  if (modalControl) {
    modalControl.style.maxHeight = '90%';
    modalControl.style.transition = 'height 0.2s ease-in-out';
    modalControl.style.overflowY = 'hidden';
  }

  const updatePackageInfoModalHeight = () => {
    setTimeout(() => {
      const height = packageInfoModal.querySelector('.col').clientHeight;
      modalControl?.style.setProperty('--dialog-height', `${height + 14}px`);
    }, 1);
  };

  const openPackageInfo = packageId => {
    if (!PACKAGES[packageId]) {
      console.error(`Did not find package ${packageId}.`, PACKAGES);
      return;
    }
    activeInfoPackageId = packageId;
    renderPackageInfo(packageId);
    packageInfoModal.hidden = false;
  };

  const renderPackageInfo = packageId => {
    const packageData = PACKAGES[packageId];
    const selectedVersionInfo = getSelectedVersionInfo(packageId);
    if (!packageData || !selectedVersionInfo) {
      console.error(`Did not find package or selected version for ${packageId}.`, PACKAGES);
      return;
    }

    packageInfoName.textContent = selectedVersionInfo.displayName ?? packageId;
    packageInfoId.textContent = packageId;
    packageInfoDescription.textContent = selectedVersionInfo.description ?? '';
    if (selectedVersionInfo.author.url) {
      packageInfoAuthorText.textContent = '';
      packageInfoAuthorText.classList.add('hidden');
      packageInfoAuthor.textContent = selectedVersionInfo.author.name ?? 'Unknown';
      packageInfoAuthor.href = selectedVersionInfo.author.url;
      packageInfoAuthor.classList.remove('hidden');
    } else if (selectedVersionInfo.author.email) {
      packageInfoAuthorText.textContent = '';
      packageInfoAuthorText.classList.add('hidden');
      packageInfoAuthor.textContent = selectedVersionInfo.author.name ?? 'Unknown';
      packageInfoAuthor.href = `mailto:${selectedVersionInfo.author.email}`;
      packageInfoAuthor.classList.remove('hidden');
    } else {
      packageInfoAuthorText.textContent = selectedVersionInfo.author.name ?? 'Unknown';
      packageInfoAuthorText.classList.remove('hidden');
      packageInfoAuthor.textContent = '';
      packageInfoAuthor.href = '###';
      packageInfoAuthor.classList.add('hidden');
    }

    packageInfoVersionSelect.innerHTML = '';
    for (const version of packageData.sortedVersions) {
      const option = document.createElement('fluent-option');
      option.value = version;
      option.textContent = version;
      packageInfoVersionSelect.appendChild(option);
    }
    packageInfoVersionSelect.value = packageData.selectedVersion;

    renderPackageKeywords(selectedVersionInfo.keywords);
    renderPackageLicense(selectedVersionInfo.license, selectedVersionInfo.licensesUrl);
    renderPackageDependencies(selectedVersionInfo.dependencies);
    updatePackageInfoModalHeight();
  };

  const createPackageRow = packageId => {
    const packageVersionInfo = getLatestStableVersionInfo(packageId);
    if (!packageVersionInfo) return null;

    const row = packageRowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.packageName = packageVersionInfo.displayName ?? packageId;
    row.dataset.packageId = packageId;
    row.querySelector('.rowPackageName').textContent = packageVersionInfo.displayName ?? packageId;
    row.querySelector('.rowPackageDescription').textContent = packageVersionInfo.description ?? '';
    row.querySelector('.rowPackageId').textContent = packageId;
    row.querySelector('.rowPackageType').textContent = getPackageType(packageId);
    row.querySelector('.rowPackageInfoButton').dataset.packageId = packageId;
    row.querySelector('.rowMenuButton').dataset.packageId = packageId;

    return row;
  };

  const renderPackageRows = () => {
    for (const existingRow of packageGrid.querySelectorAll('.package-row')) {
      existingRow.remove();
    }

    const packageIds = Object.keys(PACKAGES).sort((a, b) => {
      const packageA = getLatestStableVersionInfo(a);
      const packageB = getLatestStableVersionInfo(b);
      const nameA = (packageA?.displayName ?? a).toLowerCase();
      const nameB = (packageB?.displayName ?? b).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    for (const packageId of packageIds) {
      const row = createPackageRow(packageId);
      if (row) packageGrid.appendChild(row);
    }
  };

  const hideRowMoreMenu = event => {
    if (event?.target && (rowMoreMenu.contains(event.target) || event.target.closest('.rowMenuButton'))) return;
    document.removeEventListener('click', hideRowMoreMenu);
    rowMoreMenu.hidden = true;
  };

  const showRowMoreMenu = anchorElement => {
    const anchorRect = anchorElement.getBoundingClientRect();
    rowMoreMenu.style.top = `${anchorRect.bottom + window.scrollY}px`;
    rowMoreMenu.style.left = `${anchorRect.right + window.scrollX - 120}px`;
    rowMoreMenu.hidden = false;

    document.removeEventListener('click', hideRowMoreMenu);
    setTimeout(() => document.addEventListener('click', hideRowMoreMenu), 1);
  };

  searchInput.addEventListener('input', ({ target: { value = '' } }) => {
    const rows = packageGrid.querySelectorAll('.package-row');
    const normalized = value.toLowerCase();
    rows.forEach(row => {
      if (value === '') {
        row.style.display = 'grid';
        return;
      }

      const shouldShow =
        row.dataset?.packageName?.toLowerCase()?.includes(normalized) ||
        row.dataset?.packageId?.toLowerCase()?.includes(normalized);
      row.style.display = shouldShow ? 'grid' : 'none';
    });
  });

  urlBarHelpButton.addEventListener('click', () => addListingToVccHelp.hidden = false);
  addListingToVccHelpClose.addEventListener('click', () => addListingToVccHelp.hidden = true);

  vccListingInfoUrlFieldCopy.addEventListener('click', () => {
    vccListingInfoUrlField.select();
    navigator.clipboard.writeText(vccListingInfoUrlField.value);
    vccListingInfoUrlFieldCopy.appearance = 'accent';
    setTimeout(() => vccListingInfoUrlFieldCopy.appearance = 'neutral', 1000);
  });

  vccAddRepoButton.addEventListener('click', () => {
    if (!LISTING_URL) {
      console.error('Listing URL is not initialized.');
      return;
    }
    window.location.assign(`vcc://vpm/addRepo?url=${encodeURIComponent(LISTING_URL)}`);
  });

  vccUrlFieldCopy.addEventListener('click', () => {
    vccUrlField.select();
    navigator.clipboard.writeText(vccUrlField.value);
    vccUrlFieldCopy.appearance = 'accent';
    setTimeout(() => vccUrlFieldCopy.appearance = 'neutral', 1000);
  });

  packageGrid.addEventListener('click', event => {
    const menuButton = event.target.closest('.rowMenuButton');
    if (menuButton) {
      event.stopPropagation();
      const packageId = menuButton.dataset?.packageId ?? null;

      if (!rowMoreMenu.hidden && activeMenuPackageId === packageId) {
        hideRowMoreMenu();
        return;
      }

      activeMenuPackageId = packageId;
      showRowMoreMenu(menuButton);
      return;
    }

    const infoButton = event.target.closest('.rowPackageInfoButton');
    if (infoButton) {
      const packageId = infoButton.dataset?.packageId;
      openPackageInfo(packageId);
    }
  });

  rowMoreMenuDownload.addEventListener('click', event => {
    event.stopPropagation();
    const latestStableVersionInfo = activeMenuPackageId ? getLatestStableVersionInfo(activeMenuPackageId) : null;
    if (!downloadZipForVersion(latestStableVersionInfo)) {
      console.error(`Did not find a downloadable URL for package ${activeMenuPackageId}.`);
    }
    hideRowMoreMenu();
  });

  rowMoreMenuDownloadInstaller.addEventListener('click', async event => {
    event.stopPropagation();
    if (rowMoreMenuDownloadInstaller.dataset.loading === 'true') return;

    const latestStableVersionInfo = activeMenuPackageId ? getLatestStableVersionInfo(activeMenuPackageId) : null;
    if (!latestStableVersionInfo) {
      console.error(`Did not find package ${activeMenuPackageId}.`, PACKAGES);
      hideRowMoreMenu();
      return;
    }

    const label = rowMoreMenuDownloadInstaller.querySelector('div');
    const initialLabel = label?.textContent ?? 'Download Installer (.unitypackage)';
    rowMoreMenuDownloadInstaller.dataset.loading = 'true';
    if (label) label.textContent = 'Building Installer...';

    try {
      await downloadInstallerForVersion(latestStableVersionInfo);
    } catch (error) {
      console.error(`Failed to build installer for ${latestStableVersionInfo.packageId}`, error);
    } finally {
      rowMoreMenuDownloadInstaller.dataset.loading = 'false';
      if (label) label.textContent = initialLabel;
      hideRowMoreMenu();
    }
  });

  packageInfoModalClose.addEventListener('click', () => packageInfoModal.hidden = true);

  packageInfoVersionSelect.addEventListener('change', ({ target }) => {
    if (!activeInfoPackageId) return;
    const selectedVersion = target.value;
    if (!PACKAGES[activeInfoPackageId]?.versions[selectedVersion]) {
      console.error(`Unknown version "${selectedVersion}" for package ${activeInfoPackageId}.`);
      return;
    }
    PACKAGES[activeInfoPackageId].selectedVersion = selectedVersion;
    renderPackageInfo(activeInfoPackageId);
  });

  packageInfoDownloadZip.addEventListener('click', () => {
    if (!activeInfoPackageId) return;
    const selectedVersionInfo = getSelectedVersionInfo(activeInfoPackageId);
    if (!downloadZipForVersion(selectedVersionInfo)) {
      console.error(`Did not find a downloadable URL for package ${activeInfoPackageId}.`);
    }
  });

  packageInfoDownloadInstaller.addEventListener('click', async () => {
    if (!activeInfoPackageId) return;
    if (packageInfoDownloadInstaller.dataset.loading === 'true') return;
    const selectedVersionInfo = getSelectedVersionInfo(activeInfoPackageId);
    if (!selectedVersionInfo) {
      console.error(`Did not find package ${activeInfoPackageId}.`, PACKAGES);
      return;
    }

    const initialLabel = packageInfoDownloadInstallerLabel.textContent;
    packageInfoDownloadInstaller.dataset.loading = 'true';
    packageInfoDownloadInstallerLabel.textContent = 'Building Installer...';
    try {
      await downloadInstallerForVersion(selectedVersionInfo);
    } catch (error) {
      console.error(`Failed to build installer for ${selectedVersionInfo.packageId}`, error);
    } finally {
      packageInfoDownloadInstaller.dataset.loading = 'false';
      packageInfoDownloadInstallerLabel.textContent = initialLabel;
    }
  });

  packageInfoVccUrlFieldCopy.addEventListener('click', () => {
    packageInfoVccUrlField.select();
    navigator.clipboard.writeText(packageInfoVccUrlField.value);
    packageInfoVccUrlFieldCopy.appearance = 'accent';
    setTimeout(() => packageInfoVccUrlFieldCopy.appearance = 'neutral', 1000);
  });

  const packageInfoListingHelp = document.getElementById('packageInfoListingHelp');
  packageInfoListingHelp.addEventListener('click', () => addListingToVccHelp.hidden = false);

  const listingIndexUrl = new URL(INDEX_JSON_PATH, window.location.href);
  fetch(listingIndexUrl.toString())
    .then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch listing index: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(listing => {
      const listingUrl = resolveUrl(listing.url, listingIndexUrl.toString()) ?? listingIndexUrl.toString();
      updateListingUrlFields(listingUrl);

      const packageIndex = buildPackageIndex(listing.packages, semverLibrary, listingIndexUrl.toString());
      Object.keys(PACKAGES).forEach(key => delete PACKAGES[key]);
      Object.assign(PACKAGES, packageIndex);
      Object.keys(packageTypeCache).forEach(key => delete packageTypeCache[key]);
      renderPackageRows();
      listingName.textContent = listing.name ?? listingName.textContent;
    })
    .catch(error => {
      listingName.textContent = 'Failed to load package listing';
      console.error(error);
    });
})();
