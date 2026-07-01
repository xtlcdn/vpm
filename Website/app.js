import { baseLayerLuminance, StandardLuminance, accentBaseColor, SwatchRGB } from 'https://unpkg.com/@fluentui/web-components@2.6.1';
import { createUnityPackage, downloadUnityPackage } from './vpai_creator.js';

const LISTING_URL = "{{ listingInfo.Url }}";

const PACKAGES = {
{{~ for package in packages ~}}
  "{{ package.Name }}": {
    name: "{{ package.Name }}",
    displayName: "{{ if package.DisplayName; package.DisplayName; end; }}",
    description: "{{ if package.Description; package.Description; end; }}",
    version: "{{ package.Version }}",
    author: {
      name: "{{ if package.Author.Name; package.Author.Name; end; }}",
      url: "{{ if package.Author.Url; package.Author.Url; end; }}",
    },
    dependencies: {
      {{~ for dependency in package.Dependencies ~}}
        "{{ dependency.Name }}": "{{ dependency.Version }}",
      {{~ end ~}}
    },
    keywords: [
      {{~ for keyword in package.Keywords ~}}
        "{{ keyword }}",
      {{~ end ~}}
    ],
    license: "{{ package.License }}",
    licensesUrl: "{{ package.LicensesUrl }}",
  },
{{~ end ~}}
};

const setTheme = () => {
  baseLayerLuminance.setValueFor(document.documentElement, window.matchMedia("(prefers-color-scheme: dark)").matches ?
    StandardLuminance.DarkMode :
    StandardLuminance.LightMode
  );
  accentBaseColor.setValueFor(document.documentElement, SwatchRGB.create(0.83, 0.47, 0));
}

(() => {
  setTheme();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setTheme);

  const packageGrid = document.getElementById('packageGrid');

  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', ({ target: { value = '' } }) => {
    const items = packageGrid.querySelectorAll('fluent-data-grid-row[row-type="default"]');
    items.forEach(item => {
      if (value === '') {
        item.style.display = 'grid';
        return;
      }
      item.style.display =
        item.dataset?.packageName?.toLowerCase()?.includes(value.toLowerCase()) ||
        item.dataset?.packageId?.toLowerCase()?.includes(value.toLowerCase()) ?
        'grid' : 'none';
    });
  });

  const urlBarHelpButton = document.getElementById('urlBarHelp');
  const addListingToVccHelp = document.getElementById('addListingToVccHelp');
  urlBarHelpButton.addEventListener('click', () => addListingToVccHelp.hidden = false);
  const addListingToVccHelpClose = document.getElementById('addListingToVccHelpClose');
  addListingToVccHelpClose.addEventListener('click', () => addListingToVccHelp.hidden = true);

  const vccListingInfoUrlFieldCopy = document.getElementById('vccListingInfoUrlFieldCopy');
  vccListingInfoUrlFieldCopy.addEventListener('click', () => {
    const vccUrlField = document.getElementById('vccListingInfoUrlField');
    vccUrlField.select();
    navigator.clipboard.writeText(vccUrlField.value);
    vccUrlFieldCopy.appearance = 'accent';
    setTimeout(() => vccUrlFieldCopy.appearance = 'neutral', 1000);
  });

  const vccAddRepoButton = document.getElementById('vccAddRepoButton');
  vccAddRepoButton.addEventListener('click', () => window.location.assign(`vcc://vpm/addRepo?url=${encodeURIComponent(LISTING_URL)}`));

  const vccUrlFieldCopy = document.getElementById('vccUrlFieldCopy');
  vccUrlFieldCopy.addEventListener('click', () => {
    const vccUrlField = document.getElementById('vccUrlField');
    vccUrlField.select();
    navigator.clipboard.writeText(vccUrlField.value);
    vccUrlFieldCopy.appearance = 'accent';
    setTimeout(() => vccUrlFieldCopy.appearance = 'neutral', 1000);
  });

  const rowMoreMenu = document.getElementById('rowMoreMenu');
  const rowMoreMenuDownload = document.getElementById('rowMoreMenuDownload');
  const rowMoreMenuDownloadInstaller = document.getElementById('rowMoreMenuDownloadInstaller');
  let activeMenuPackageId = null;
  let activeMenuPackageUrl = null;
  const hideRowMoreMenu = e => {
    if (e?.target && (rowMoreMenu.contains(e.target) || e.target.closest('.rowMenuButton')))
      return;
    document.removeEventListener('click', hideRowMoreMenu);
    rowMoreMenu.hidden = true;
  }

  const showRowMoreMenu = anchorElement => {
    const anchorRect = anchorElement.getBoundingClientRect();
    rowMoreMenu.style.top = `${anchorRect.bottom + window.scrollY}px`;
    rowMoreMenu.style.left = `${anchorRect.right + window.scrollX - 120}px`;
    rowMoreMenu.hidden = false;

    document.removeEventListener('click', hideRowMoreMenu);
    setTimeout(() => document.addEventListener('click', hideRowMoreMenu), 1);
  };

  const handleRowMenuButtonClick = event => {
    event.stopPropagation();

    const { currentTarget } = event;
    const packageId = currentTarget.dataset?.packageId ?? null;
    const packageUrl = currentTarget.dataset?.packageUrl ?? null;

    if (!rowMoreMenu.hidden && activeMenuPackageId === packageId) {
      hideRowMoreMenu();
      return;
    }

    activeMenuPackageId = packageId;
    activeMenuPackageUrl = packageUrl;
    showRowMoreMenu(currentTarget);
  };

  const rowMenuButtons = document.querySelectorAll('.rowMenuButton');
  for (const button of rowMenuButtons) button.addEventListener('click', handleRowMenuButtonClick);

  rowMoreMenuDownload.addEventListener('click', event => {
    event.stopPropagation();
    if (activeMenuPackageUrl) window.open(activeMenuPackageUrl, '_blank');
    hideRowMoreMenu();
  });

  rowMoreMenuDownloadInstaller.addEventListener('click', async event => {
    event.stopPropagation();
    if (rowMoreMenuDownloadInstaller.dataset.loading === 'true') {
      return;
    }

    if (!activeMenuPackageId || !PACKAGES?.[activeMenuPackageId]) {
      console.error(`Did not find package ${activeMenuPackageId}. Packages available:`, PACKAGES);
      hideRowMoreMenu();
      return;
    }

    const label = rowMoreMenuDownloadInstaller.querySelector('div');
    const initialLabel = label?.textContent;
    rowMoreMenuDownloadInstaller.dataset.loading = 'true';
    if (label) label.textContent = 'Building Installer...';

    try {
      const { name, version } = PACKAGES[activeMenuPackageId];
      const installerContent = await createUnityPackage({
        vpmRepositories: [LISTING_URL],
        vpmDependencies: { [activeMenuPackageId]: version },
      });
      const installerFileName = `${name}-${version}-installer.unitypackage`.replace(/[\[\]\/\\?%*:|"<>]/g, '_');
      downloadUnityPackage(installerContent, installerFileName);
    } catch (error) {
      console.error(`Failed to build installer for ${activeMenuPackageId}`, error);
    } finally {
      rowMoreMenuDownloadInstaller.dataset.loading = 'false';
      if (label && initialLabel) {
        label.textContent = initialLabel;
      }
      hideRowMoreMenu();
    }
  });

  const packageInfoModal = document.getElementById('packageInfoModal');
  const packageInfoModalClose = document.getElementById('packageInfoModalClose');
  packageInfoModalClose.addEventListener('click', () => packageInfoModal.hidden = true);

  // Fluent dialogs use nested shadow-rooted elements, so we need to use JS to style them
  const modalControl = packageInfoModal.shadowRoot?.querySelector('.control');
  if (modalControl) {
    modalControl.style.maxHeight = "90%";
    modalControl.style.transition = 'height 0.2s ease-in-out';
    modalControl.style.overflowY = 'hidden';
  }

  const packageInfoName = document.getElementById('packageInfoName');
  const packageInfoId = document.getElementById('packageInfoId');
  const packageInfoVersion = document.getElementById('packageInfoVersion');
  const packageInfoDescription = document.getElementById('packageInfoDescription');
  const packageInfoAuthor = document.getElementById('packageInfoAuthor');
  const packageInfoDependencies = document.getElementById('packageInfoDependencies');
  const packageInfoKeywords = document.getElementById('packageInfoKeywords');
  const packageInfoLicense = document.getElementById('packageInfoLicense');

  const addToVCCUrl = `vcc://vpm/addRepo?url=${encodeURIComponent(LISTING_URL)}`;
  const handleAddToVccClick = () => window.location.assign(addToVCCUrl);

  const rowAddToVccButtons = document.querySelectorAll('.rowAddToVccButton');
  for (const button of rowAddToVccButtons) button.addEventListener('click', handleAddToVccClick);

  const renderPackageKeywords = (keywords = []) => {
    if (keywords.length === 0) {
      packageInfoKeywords.parentElement.classList.add('hidden');
      return;
    }

    packageInfoKeywords.parentElement.classList.remove('hidden');
    packageInfoKeywords.innerHTML = null;
    for (const keyword of keywords) {
      const keywordDiv = document.createElement('div');
      keywordDiv.classList.add('me-2', 'mb-2', 'badge');
      keywordDiv.textContent = keyword;
      packageInfoKeywords.appendChild(keywordDiv);
    }
  };

  const renderPackageLicense = (license, licensesUrl) => {
    if (!license?.length && !licensesUrl?.length) {
      packageInfoLicense.parentElement.classList.add('hidden');
      return;
    }

    packageInfoLicense.parentElement.classList.remove('hidden');
    packageInfoLicense.textContent = license ?? 'See License';
    packageInfoLicense.href = licensesUrl ?? '#';
  };

  const renderPackageDependencies = dependencies => {
    packageInfoDependencies.innerHTML = null;
    for (const [name, version] of Object.entries(dependencies)) {
      const depRow = document.createElement('li');
      depRow.classList.add('mb-2');
      depRow.textContent = `${name} @ v${version}`;
      packageInfoDependencies.appendChild(depRow);
    }
  };

  const updatePackageInfoModalHeight = () => {
    setTimeout(() => {
      const height = packageInfoModal.querySelector('.col').clientHeight;
      modalControl?.style.setProperty('--dialog-height', `${height + 14}px`);
    }, 1);
  };

  const handlePackageInfoButtonClick = ({ currentTarget }) => {
    const packageId = currentTarget.dataset?.packageId;
    const packageInfo = PACKAGES?.[packageId];
    if (!packageInfo) {
      console.error(`Did not find package ${packageId}. Packages available:`, PACKAGES);
      return;
    }

    packageInfoName.textContent = packageInfo.displayName;
    packageInfoId.textContent = packageId;
    packageInfoVersion.textContent = `v${packageInfo.version}`;
    packageInfoDescription.textContent = packageInfo.description;
    packageInfoAuthor.textContent = packageInfo.author.name;
    packageInfoAuthor.href = packageInfo.author.url;

    renderPackageKeywords(packageInfo.keywords);
    renderPackageLicense(packageInfo.license, packageInfo.licensesUrl);
    renderPackageDependencies(packageInfo.dependencies);

    packageInfoModal.hidden = false;
    updatePackageInfoModalHeight();
  };

  const rowPackageInfoButton = document.querySelectorAll('.rowPackageInfoButton');
  for (const button of rowPackageInfoButton) button.addEventListener('click', handlePackageInfoButtonClick);

  const packageInfoVccUrlFieldCopy = document.getElementById('packageInfoVccUrlFieldCopy');
  packageInfoVccUrlFieldCopy.addEventListener('click', () => {
    const vccUrlField = document.getElementById('packageInfoVccUrlField');
    vccUrlField.select();
    navigator.clipboard.writeText(vccUrlField.value);
    vccUrlFieldCopy.appearance = 'accent';
    setTimeout(() => vccUrlFieldCopy.appearance = 'neutral', 1000);
  });

  const packageInfoListingHelp = document.getElementById('packageInfoListingHelp');
  packageInfoListingHelp.addEventListener('click', () => addListingToVccHelp.hidden = false);
})();